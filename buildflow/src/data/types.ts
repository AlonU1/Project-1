// ===== מודל הנתונים — ראה SPEC.md §5 =====

export type Role = 'admin' | 'pm' | 'supervisor' | 'contractor'
export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed'
export type ProjectType = 'residential' | 'office' | 'infrastructure' | 'industrial' | 'other'
export type LocationType =
  | 'site' | 'building' | 'wing' | 'floor' | 'unit' | 'space'
  | 'zone' | 'section' | 'system' | 'segment' | 'custom'
export type DefectStatus = 'open' | 'in_progress' | 'ready_for_review' | 'rejected' | 'closed' | 'cancelled'
export type Severity = 'low' | 'medium' | 'high' | 'critical'
export type TaskStatus = 'new' | 'in_progress' | 'blocked' | 'review' | 'done'
export type Priority = 'low' | 'normal' | 'high'
export type EntityType = 'defect' | 'task' | 'daily_log'

/** שדות משותפים לכל ישות — SPEC §5.2 */
export interface Base {
  id: string
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  archived_at: string | null
}

export interface Company extends Base {
  name: string
  type: 'owner' | 'contractor' | 'consultant'
  contact_name?: string
  phone?: string
}

export interface User extends Base {
  full_name: string
  email: string
  phone?: string
  company_id: string
  role: Role
  color: string
  is_active: boolean
}

export interface Project extends Base {
  company_id: string
  name: string
  code: string
  type: ProjectType
  address?: string
  city?: string
  start_date?: string
  end_date?: string
  status: ProjectStatus
  pm_user_id?: string
  progress_pct: number
}

export interface ProjectMember extends Base {
  project_id: string
  user_id: string
}

/** עץ מיקומים גנרי — SPEC §6 */
export interface LocationNode extends Base {
  project_id: string
  parent_id: string | null
  type: LocationType
  name: string
  code?: string
  sort_order: number
  /** materialized path: /id1/id2/id3 (כולל את הצומת עצמו) */
  path: string
  depth: number
  plan_id?: string | null
}

export interface Plan extends Base {
  project_id: string
  name: string
  discipline: 'architecture' | 'structure' | 'mep' | 'other'
  sheet_number?: string
  current_version_id?: string | null
}

/** נקודת עיגון: מיקום יחסי על התוכנית (0–1) ↔ קואורדינטה אמיתית במטרים */
export interface GeoRefPoint { px: number; py: number; e: number; n: number }
/** עיגון התוכנית לרשת קואורדינטות — SPEC §7.6 */
export interface GeoRef { points: GeoRefPoint[]; crs: string }

export interface PlanVersion extends Base {
  plan_id: string
  version_number: number
  blob_id: string
  file_type: 'svg' | 'png' | 'jpg' | 'pdf'
  /** עבור PDF רב-עמודי — העמוד שרונדר */
  page_number?: number
  width_px: number
  height_px: number
  georef?: GeoRef | null
  notes?: string
  is_current: boolean
}

/** סימון וקטורי על גבי תמונה — SPEC §7.5. קואורדינטות יחסיות 0–1; המקור לא משתנה. */
export type AnnoShape =
  | { t: 'arrow'; x1: number; y1: number; x2: number; y2: number; c: string }
  | { t: 'rect'; x: number; y: number; w: number; h: number; c: string }
  | { t: 'ellipse'; cx: number; cy: number; rx: number; ry: number; c: string }
  | { t: 'free'; pts: number[]; c: string }
  | { t: 'text'; x: number; y: number; s: string; c: string }

export interface Defect extends Base {
  project_id: string
  number: number
  title: string
  description?: string
  location_id: string
  /** קואורדינטות יחסיות 0–1 על גבי התוכנית — SPEC §7.3 */
  pin_x?: number | null
  pin_y?: number | null
  plan_version_id?: string | null
  dtype?: string
  severity: Severity
  status: DefectStatus
  assigned_company_id?: string | null
  assigned_user_id?: string | null
  due_date?: string | null
  closed_at?: string | null
  closed_by?: string | null
  reopen_count: number
}

export interface Task extends Base {
  project_id: string
  number: number
  title: string
  description?: string
  location_id?: string | null
  status: TaskStatus
  priority: Priority
  assigned_company_id?: string | null
  assigned_user_id?: string | null
  due_date?: string | null
  progress_pct: number
  blocked_reason?: string
}

export interface Attachment extends Base {
  project_id: string
  entity_type: EntityType
  entity_id: string
  kind: 'photo' | 'document'
  blob_id: string
  thumb_blob_id?: string | null
  file_name: string
  mime_type: string
  width?: number
  height?: number
  taken_at?: string
  location_id?: string | null
  caption?: string
  annotations?: AnnoShape[]
  phase: 'before' | 'after' | 'general'
}

export interface CommentRow extends Base {
  project_id: string
  entity_type: EntityType
  entity_id: string
  body: string
}

export interface ActivityRow extends Base {
  project_id: string
  entity_type: EntityType
  entity_id: string
  action: 'created' | 'status_changed' | 'assigned' | 'commented' | 'attachment_added' | 'due_changed' | 'pin_changed' | 'closed' | 'reopened'
  old_value?: string | null
  new_value?: string | null
  at: string
}

export interface ManpowerRow { company_id: string; trade: string; count: number }

export interface DailyLog extends Base {
  project_id: string
  date: string
  weather?: string
  temp_c?: number | null
  hours_from?: string
  hours_to?: string
  manpower: ManpowerRow[]
  equipment: string[]
  work_performed?: string
  deliveries?: string
  safety_events?: string
  delays?: string
  visitors?: string
  notes?: string
  status: 'draft' | 'submitted' | 'locked'
  locked_at?: string | null
  locked_by?: string | null
}

export interface NotificationRow extends Base {
  user_id: string
  ntype: string
  title: string
  body?: string
  entity_type?: EntityType
  entity_id?: string
  project_id?: string
  read_at: string | null
}

/** תור סנכרון מקומי — SPEC §8.3 */
export interface OutboxRow {
  seq?: number
  op: 'create' | 'update' | 'archive' | 'bulk'
  table: string
  entity_id: string
  at: string
  status: 'pending' | 'failed' | 'done'
}

export interface BlobRow { id: string; blob: Blob }
export interface MetaRow { key: string; value: string }
