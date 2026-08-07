import type { Role, User } from '../data/types'

// ===== מטריצת ההרשאות — SPEC §4.2. ארבעה תפקידים קבועים, בלי מנוע גנרי. =====

export type Action =
  | 'project:create' | 'project:edit' | 'project:archive'
  | 'structure:edit'
  | 'plan:upload'
  | 'defect:create' | 'defect:assign' | 'defect:close' | 'defect:reopen' | 'defect:cancel'
  | 'defect:view_all'
  | 'task:create'
  | 'log:fill' | 'log:lock'
  | 'people:manage' | 'people:invite'
  | 'report:export'
  | 'dashboard:full'

const STAFF: Role[] = ['admin', 'pm', 'supervisor']
const MGMT: Role[] = ['admin', 'pm']

const MATRIX: Record<Action, Role[]> = {
  'project:create': MGMT,
  'project:edit': MGMT,
  'project:archive': MGMT,
  'structure:edit': MGMT,
  'plan:upload': STAFF,
  'defect:create': STAFF,
  'defect:assign': STAFF,
  'defect:close': STAFF,
  'defect:reopen': STAFF,
  'defect:cancel': MGMT,
  'defect:view_all': STAFF,
  'task:create': STAFF,
  'log:fill': STAFF,
  'log:lock': MGMT,
  'people:manage': ['admin'],
  'people:invite': MGMT,
  'report:export': STAFF,
  'dashboard:full': STAFF,
}

export function can(user: User | null | undefined, action: Action): boolean {
  if (!user) return false
  return MATRIX[action].includes(user.role)
}

/** כלל הזהב לקבלן משנה — רואה רק פריטים של החברה שלו (SPEC §4.2) */
export function visibleToUser<T extends { assigned_company_id?: string | null }>(user: User, items: T[]): T[] {
  if (user.role !== 'contractor') return items
  return items.filter(i => i.assigned_company_id === user.company_id)
}
