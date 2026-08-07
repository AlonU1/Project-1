import type { DefectStatus, LocationType, Priority, ProjectStatus, ProjectType, Role, Severity, TaskStatus } from '../data/types'

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'מנהל מערכת',
  pm: 'מנהל פרויקט',
  supervisor: 'מפקח / מנהל עבודה',
  contractor: 'קבלן משנה',
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: 'בתכנון', active: 'פעיל', on_hold: 'מוקפא', completed: 'הושלם',
}

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  residential: 'מגורים', office: 'משרדים', infrastructure: 'תשתית', industrial: 'תעשייה', other: 'אחר',
}

export const LOCATION_TYPE_LABEL: Record<LocationType, string> = {
  site: 'אתר', building: 'בניין', wing: 'אגף', floor: 'קומה', unit: 'דירה', space: 'חלל',
  zone: 'אזור', section: 'קטע', system: 'מערכת', segment: 'מקטע', custom: 'אחר',
}

export const STATUS_LABEL: Record<DefectStatus, string> = {
  open: 'פתוח', in_progress: 'בטיפול', ready_for_review: 'ממתין לבדיקה',
  rejected: 'נדחה', closed: 'סגור', cancelled: 'בוטל',
}

/** צבעי סטטוס קבועים בכל המערכת — SPEC §15 */
export const STATUS_HEX: Record<DefectStatus, string> = {
  open: '#dc2626', in_progress: '#ea580c', ready_for_review: '#2563eb',
  rejected: '#7c3aed', closed: '#16a34a', cancelled: '#64748b',
}

export const STATUS_BADGE: Record<DefectStatus, string> = {
  open: 'bg-st-open/10 text-st-open border-st-open/30',
  in_progress: 'bg-st-progress/10 text-st-progress border-st-progress/30',
  ready_for_review: 'bg-st-review/10 text-st-review border-st-review/30',
  rejected: 'bg-st-rejected/10 text-st-rejected border-st-rejected/30',
  closed: 'bg-st-closed/10 text-st-closed border-st-closed/30',
  cancelled: 'bg-st-cancelled/10 text-st-cancelled border-st-cancelled/30',
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  low: 'נמוכה', medium: 'בינונית', high: 'גבוהה', critical: 'קריטית',
}

export const SEVERITY_DOT: Record<Severity, string> = {
  low: 'bg-slate-400', medium: 'bg-amber-500', high: 'bg-red-500', critical: 'bg-red-800',
}

export const DEFECT_TYPES = [
  'בטון', 'טיח', 'ריצוף', 'איטום', 'חשמל', 'אינסטלציה', 'מיזוג',
  'אלומיניום', 'נגרות', 'צבע', 'גבס', 'בטיחות', 'ניקיון', 'אחר',
]

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  new: 'חדשה', in_progress: 'בביצוע', blocked: 'חסומה', review: 'לבדיקה', done: 'הושלמה',
}

export const TASK_STATUS_COLOR: Record<TaskStatus, string> = {
  new: 'bg-slate-500', in_progress: 'bg-st-progress', blocked: 'bg-st-rejected',
  review: 'bg-st-review', done: 'bg-st-closed',
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'נמוכה', normal: 'רגילה', high: 'גבוהה',
}

export const WEATHER_LABEL: Record<string, string> = {
  clear: 'בהיר ☀️', cloudy: 'מעונן ⛅', rain: 'גשם 🌧️', heat: 'שרב 🥵', wind: 'רוח חזקה 💨',
}
