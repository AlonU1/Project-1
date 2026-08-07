import { db } from '../../data/db'
import { dl } from '../../data/layer'
import type { EntityType, Priority, Task, TaskStatus, User } from '../../data/types'

export interface NewTaskInput {
  project_id: string
  title: string
  description?: string
  location_id?: string | null
  priority: Priority
  assigned_company_id?: string | null
  due_date?: string | null
}

export async function createTask(input: NewTaskInput, user: User): Promise<Task> {
  const all = await db.tasks.where('project_id').equals(input.project_id).toArray()
  const number = all.reduce((m, t) => Math.max(m, t.number), 0) + 1
  const task = await dl.create<Task>('tasks', {
    ...input, number, status: 'new' as TaskStatus, progress_pct: 0, assigned_user_id: null,
  }, user)
  if (input.assigned_company_id) {
    const users = await db.users.where('company_id').equals(input.assigned_company_id).toArray()
    for (const u of users) {
      if (u.id === user.id) continue
      await dl.create('notifications', {
        user_id: u.id, ntype: 'assigned', title: `הוקצתה לך משימה #${number} — ${input.title}`,
        entity_type: 'task' as EntityType, entity_id: task.id, project_id: input.project_id, read_at: null,
      }, user)
    }
  }
  return task
}

export async function setTaskStatus(t: Task, status: TaskStatus, user: User, blockedReason?: string) {
  const patch: Partial<Task> = { status }
  if (status === 'blocked') patch.blocked_reason = blockedReason ?? ''
  if (status === 'done') patch.progress_pct = 100
  await dl.update<Task>('tasks', t.id, patch, user)
}

export async function setTaskProgress(t: Task, pct: number, user: User) {
  await dl.update<Task>('tasks', t.id, { progress_pct: pct }, user)
}
