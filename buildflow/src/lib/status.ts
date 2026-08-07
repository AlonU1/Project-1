import type { Defect, DefectStatus, User } from '../data/types'

// ===== מכונת המצבים של ליקוי — SPEC §5.5 =====

type Transition = {
  to: DefectStatus
  label: string
  /** מי רשאי לבצע את המעבר */
  roles: Array<User['role']>
  /** האם קבלן חייב להיות מהחברה המוקצית */
  contractorOwnOnly?: boolean
  style: 'primary' | 'success' | 'danger' | 'neutral'
}

const T: Record<DefectStatus, Transition[]> = {
  open: [
    { to: 'in_progress', label: 'התחל טיפול', roles: ['admin', 'pm', 'supervisor', 'contractor'], contractorOwnOnly: true, style: 'primary' },
    { to: 'ready_for_review', label: 'תוקן — העבר לבדיקה', roles: ['admin', 'pm', 'supervisor', 'contractor'], contractorOwnOnly: true, style: 'primary' },
    { to: 'cancelled', label: 'בטל פריט', roles: ['admin', 'pm'], style: 'neutral' },
  ],
  in_progress: [
    { to: 'ready_for_review', label: 'סיימתי — לבדיקה', roles: ['admin', 'pm', 'supervisor', 'contractor'], contractorOwnOnly: true, style: 'primary' },
    { to: 'cancelled', label: 'בטל פריט', roles: ['admin', 'pm'], style: 'neutral' },
  ],
  ready_for_review: [
    { to: 'closed', label: 'אשר וסגור', roles: ['admin', 'pm', 'supervisor'], style: 'success' },
    { to: 'rejected', label: 'דחה — נדרש תיקון נוסף', roles: ['admin', 'pm', 'supervisor'], style: 'danger' },
  ],
  rejected: [
    { to: 'in_progress', label: 'חזרה לטיפול', roles: ['admin', 'pm', 'supervisor', 'contractor'], contractorOwnOnly: true, style: 'primary' },
  ],
  closed: [
    { to: 'open', label: 'פתח מחדש', roles: ['admin', 'pm', 'supervisor'], style: 'danger' },
  ],
  cancelled: [],
}

export function allowedTransitions(user: User, defect: Defect): Transition[] {
  return T[defect.status].filter(t => {
    if (!t.roles.includes(user.role)) return false
    if (user.role === 'contractor' && t.contractorOwnOnly && defect.assigned_company_id !== user.company_id) return false
    return true
  })
}

export function isValidTransition(from: DefectStatus, to: DefectStatus): boolean {
  return T[from].some(t => t.to === to)
}

/** חריגה נגזרת — לא נשמרת בשדה (SPEC §5.5) */
export function isOverdue(d: Pick<Defect, 'due_date' | 'status'>): boolean {
  if (!d.due_date) return false
  if (d.status === 'closed' || d.status === 'cancelled') return false
  return d.due_date < new Date().toISOString().slice(0, 10)
}

export const OPEN_STATUSES: DefectStatus[] = ['open', 'in_progress', 'ready_for_review', 'rejected']
