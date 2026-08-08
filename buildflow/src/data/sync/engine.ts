// ===== מנוע הסנכרון — SPEC §8 =====
// דוחף את ה-outbox המקומי לענן, מושך שינויים מהענן למקומי (LWW לפי updated_at),
// ומאזין ל-Realtime כדי ששינוי ממכשיר אחד יגיע לשני תוך שניות.
// ללא רשת — הכול ממשיך לעבוד מקומית; התור מחכה.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { create } from 'zustand'
import { db } from '../db'
import { getBlob } from '../blobs'
import { STORAGE_BUCKET, SUPABASE_ANON_KEY, SUPABASE_URL, syncEnabled } from './config'
import type { OutboxRow } from '../types'

const SYNC_TABLES = [
  'companies', 'users', 'projects', 'members', 'locations',
  'plans', 'plan_versions', 'defects', 'tasks', 'attachments',
  'comments', 'activity', 'daily_logs', 'notifications',
] as const
type SyncTable = (typeof SYNC_TABLES)[number]

interface SyncStatus {
  status: 'off' | 'idle' | 'syncing' | 'error'
  lastSync: string | null
  error?: string
}

export const useSyncState = create<SyncStatus>(() => ({
  status: syncEnabled ? 'idle' : 'off',
  lastSync: null,
}))

let client: SupabaseClient | null = null
let started = false
let running = false
let debounceTimer: ReturnType<typeof setTimeout> | undefined
let pending = false

export function startSync() {
  if (!syncEnabled || started) return
  started = true
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  void syncNow()

  // שינויים ממכשירים אחרים — Realtime
  client
    .channel('bf-rows')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bf_rows' }, () => poke())
    .subscribe()

  window.addEventListener('online', () => void syncNow())
  setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow()
  }, 30_000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow()
  })
}

/** קריאה מרוככת — נקראת אחרי כל כתיבה מקומית */
export function poke() {
  if (!started) return
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => void syncNow(), 1500)
}

export async function syncNow(): Promise<void> {
  if (!client) return
  if (running) { pending = true; return }
  running = true
  useSyncState.setState({ status: 'syncing' })
  try {
    await push()
    await pull()
    useSyncState.setState({ status: 'idle', lastSync: new Date().toISOString(), error: undefined })
  } catch (e) {
    useSyncState.setState({ status: 'error', error: String(e) })
  } finally {
    running = false
    if (pending) { pending = false; void syncNow() }
  }
}

// ---------- דחיפה: outbox → ענן ----------

async function push() {
  const ops = (await db.outbox.where('status').equals('pending').toArray())
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
  for (const op of ops) {
    await pushOp(op)
    await db.outbox.update(op.seq!, { status: 'done' })
  }
}

async function pushOp(op: OutboxRow) {
  const tbl = op.table as SyncTable
  if (!SYNC_TABLES.includes(tbl)) return

  if (op.op === 'bulk') {
    // יצירה מרובה (מבנה פרויקט) — דוחפים את כל מה שנוצר סביב אותו רגע
    const cutoff = new Date(new Date(op.at).getTime() - 15_000).toISOString()
    const rows = await db.table(tbl).filter(r => (r as { updated_at: string }).updated_at >= cutoff).toArray()
    await upsertRows(tbl, rows)
    return
  }

  const row = await db.table(tbl).get(op.entity_id)
  if (!row) return
  await uploadRowBlobs(tbl, row as Record<string, unknown>)
  await upsertRows(tbl, [row])
}

async function upsertRows(tbl: string, rows: unknown[]) {
  if (!rows.length) return
  const payload = (rows as Array<{ id: string; updated_at: string }>).map(r => ({
    tbl, id: r.id, data: r, updated_at: r.updated_at,
  }))
  const { error } = await client!.from('bf_rows').upsert(payload)
  if (error) throw new Error(`push ${tbl}: ${error.message}`)
}

async function uploadRowBlobs(tbl: SyncTable, row: Record<string, unknown>) {
  const ids: Array<string | null | undefined> = []
  if (tbl === 'attachments') ids.push(row.blob_id as string, row.thumb_blob_id as string | null)
  if (tbl === 'plan_versions') ids.push(row.blob_id as string)
  for (const id of ids) {
    if (!id) continue
    const blob = await getBlob(id)
    if (!blob) continue
    const { error } = await client!.storage
      .from(STORAGE_BUCKET)
      .upload(`blobs/${id}`, blob, { upsert: true, contentType: blob.type || 'application/octet-stream' })
    if (error && !/exist/i.test(error.message)) throw new Error(`upload blob: ${error.message}`)
  }
}

// ---------- משיכה: ענן → מקומי ----------

async function pull() {
  const cursorRow = await db.meta.get('sync_cursor')
  let cursor = cursorRow?.value ?? '1970-01-01T00:00:00Z'

  for (;;) {
    const { data, error } = await client!
      .from('bf_rows')
      .select('tbl,id,data,updated_at')
      .gt('updated_at', cursor)
      .order('updated_at', { ascending: true })
      .limit(500)
    if (error) throw new Error(`pull: ${error.message}`)
    if (!data?.length) break

    for (const rec of data) {
      const tbl = rec.tbl as SyncTable
      if (SYNC_TABLES.includes(tbl)) {
        const remote = rec.data as { id: string; updated_at: string }
        const local = await db.table(tbl).get(rec.id) as { updated_at: string } | undefined
        // Last-Write-Wins לפי updated_at (SPEC §8.4)
        if (!local || remote.updated_at > local.updated_at) {
          await db.table(tbl).put(remote)
        }
      }
      if (rec.updated_at > cursor) cursor = rec.updated_at
    }
    await db.meta.put({ key: 'sync_cursor', value: cursor })
    if (data.length < 500) break
  }
}
