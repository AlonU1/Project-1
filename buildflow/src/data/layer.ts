import { db } from './db'
import { uid } from '../lib/util'
import type { Base, User } from './types'

// ===== שכבת הנתונים — SPEC §8. כל כתיבה: מקומית מיידית + רישום ל-outbox. =====
// רכיבים לא ניגשים ל-Dexie ישירות אלא דרך השכבה הזו (חריג: bulk בזריעה/יצירת מבנה).

export type TableName =
  | 'companies' | 'users' | 'projects' | 'members' | 'locations'
  | 'plans' | 'plan_versions' | 'defects' | 'tasks' | 'attachments'
  | 'comments' | 'activity' | 'daily_logs' | 'notifications'

const now = () => new Date().toISOString()

async function enqueue(op: 'create' | 'update' | 'archive' | 'bulk', table: string, entity_id: string) {
  await db.outbox.add({ op, table, entity_id, at: now(), status: 'pending' })
}

export function stamp(user: User | null | undefined) {
  const t = now()
  const u = user?.id ?? 'system'
  return { created_at: t, created_by: u, updated_at: t, updated_by: u, archived_at: null }
}

export const dl = {
  async create<T extends Base = Base>(table: TableName, data: Record<string, unknown>, user?: User | null): Promise<T> {
    const row = { id: (data.id as string | undefined) ?? uid(), ...data, ...stamp(user) } as unknown as T
    await db.table(table).add(row)
    await enqueue('create', table, row.id)
    return row
  },

  async update<T extends Base>(table: TableName, id: string, patch: Partial<T>, user?: User | null): Promise<void> {
    await db.table(table).update(id, { ...patch, updated_at: now(), updated_by: user?.id ?? 'system' })
    await enqueue('update', table, id)
  },

  async archive(table: TableName, id: string, user?: User | null): Promise<void> {
    await db.table(table).update(id, { archived_at: now(), updated_at: now(), updated_by: user?.id ?? 'system' })
    await enqueue('archive', table, id)
  },

  async bulkAdd<T extends Base>(table: TableName, rows: T[], tag: string): Promise<void> {
    await db.table(table).bulkAdd(rows as unknown[] as T[])
    await enqueue('bulk', table, tag)
  },
}

export const notArchived = <T extends Base>(rows: T[]) => rows.filter(r => !r.archived_at)
