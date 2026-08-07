import { db } from '../../data/db'
import { dl } from '../../data/layer'
import { putBlob } from '../../data/blobs'
import { compressImage } from '../../lib/image'
import { isValidTransition } from '../../lib/status'
import { STATUS_LABEL } from '../../lib/labels'
import type { Defect, DefectStatus, EntityType, Severity, User } from '../../data/types'

async function nextNumber(projectId: string): Promise<number> {
  const all = await db.defects.where('project_id').equals(projectId).toArray()
  return all.reduce((m, d) => Math.max(m, d.number), 0) + 1
}

async function logActivity(user: User, d: Defect, action: 'created' | 'status_changed' | 'assigned' | 'commented' | 'attachment_added', oldV?: string | null, newV?: string | null) {
  await dl.create('activity', {
    project_id: d.project_id, entity_type: 'defect' as EntityType, entity_id: d.id,
    action, old_value: oldV ?? null, new_value: newV ?? null, at: new Date().toISOString(),
  }, user)
}

/** התראות לפי SPEC §11 — לא שולחים למבצע הפעולה עצמו */
async function notify(actor: User, userIds: string[], ntype: string, title: string, d: Defect) {
  const targets = [...new Set(userIds)].filter(id => id && id !== actor.id)
  for (const uid of targets) {
    await dl.create('notifications', {
      user_id: uid, ntype, title,
      entity_type: 'defect' as EntityType, entity_id: d.id, project_id: d.project_id, read_at: null,
    }, actor)
  }
}

async function companyUserIds(companyId?: string | null): Promise<string[]> {
  if (!companyId) return []
  const users = await db.users.where('company_id').equals(companyId).toArray()
  return users.map(u => u.id)
}

async function staffUserIds(projectId: string): Promise<string[]> {
  const members = await db.members.where('project_id').equals(projectId).toArray()
  const users = await db.users.bulkGet(members.map(m => m.user_id))
  return users.filter(u => u && (u.role === 'pm' || u.role === 'supervisor')).map(u => u!.id)
}

export interface NewDefectInput {
  project_id: string
  title: string
  description?: string
  location_id: string
  pin_x?: number | null
  pin_y?: number | null
  plan_version_id?: string | null
  dtype?: string
  severity: Severity
  assigned_company_id?: string | null
  assigned_user_id?: string | null
  due_date?: string | null
}

export async function createDefect(input: NewDefectInput, photos: File[], user: User): Promise<Defect> {
  const number = await nextNumber(input.project_id)
  const defect = await dl.create<Defect>('defects', {
    ...input, number, status: 'open' as DefectStatus, reopen_count: 0,
    closed_at: null, closed_by: null,
  }, user)

  await logActivity(user, defect, 'created')
  if (input.assigned_company_id) {
    await logActivity(user, defect, 'assigned', null, input.assigned_company_id)
    const ids = input.assigned_user_id ? [input.assigned_user_id] : await companyUserIds(input.assigned_company_id)
    await notify(user, ids, 'assigned', `הוקצה לך ליקוי #${number} — ${input.title}`, defect)
  }
  await addPhotos(defect, photos, user, 'before')
  return defect
}

export async function addPhotos(d: Defect, files: File[], user: User, phase: 'before' | 'after' | 'general') {
  for (const file of files) {
    const c = await compressImage(file)
    const blobId = await putBlob(c.full)
    const thumbId = await putBlob(c.thumb)
    await dl.create('attachments', {
      project_id: d.project_id, entity_type: 'defect' as EntityType, entity_id: d.id, kind: 'photo' as const,
      blob_id: blobId, thumb_blob_id: thumbId, file_name: file.name || 'photo.jpg',
      mime_type: 'image/jpeg', width: c.width, height: c.height,
      taken_at: new Date().toISOString(), location_id: d.location_id, phase,
    }, user)
  }
  if (files.length) await logActivity(user, d, 'attachment_added', null, String(files.length))
}

export async function changeStatus(d: Defect, to: DefectStatus, user: User, note?: string): Promise<void> {
  if (!isValidTransition(d.status, to)) throw new Error(`מעבר לא חוקי: ${d.status} → ${to}`)

  const patch: Partial<Defect> = { status: to }
  if (to === 'closed') { patch.closed_at = new Date().toISOString(); patch.closed_by = user.id }
  if (d.status === 'closed' && to === 'open') patch.reopen_count = d.reopen_count + 1
  await dl.update<Defect>('defects', d.id, patch, user)
  await logActivity(user, d, 'status_changed', d.status, to)
  if (note) await addComment(d.project_id, 'defect', d.id, note, user)

  const title = `ליקוי #${d.number} ${d.title}: ${STATUS_LABEL[d.status]} ← ${STATUS_LABEL[to]}`
  if (to === 'ready_for_review') {
    await notify(user, [...await staffUserIds(d.project_id), d.created_by], 'review', `ליקוי #${d.number} ממתין לבדיקה — ${d.title}`, d)
  } else if (to === 'rejected' || to === 'closed' || to === 'open') {
    const ids = d.assigned_user_id ? [d.assigned_user_id] : await companyUserIds(d.assigned_company_id)
    await notify(user, [...ids, d.created_by], to, title, d)
  }
}

export async function addComment(projectId: string, entityType: EntityType, entityId: string, body: string, user: User) {
  await dl.create('comments', { project_id: projectId, entity_type: entityType, entity_id: entityId, body }, user)
  if (entityType === 'defect') {
    const d = await db.defects.get(entityId)
    if (d) {
      await logActivity(user, d, 'commented')
      const ids = [d.created_by, d.assigned_user_id ?? '', ...(await companyUserIds(d.assigned_company_id))]
      await notify(user, ids, 'comment', `תגובה חדשה בליקוי #${d.number} — ${d.title}`, d)
    }
  }
}
