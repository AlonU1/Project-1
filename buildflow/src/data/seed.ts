// ===== נתוני דמו — פרויקט "מגדלי הפארק, בניין A" =====
// נטען בהפעלה הראשונה. איפוס: הגדרות → "אפס נתוני דמו".

import { db } from './db'
import { putBlob } from './blobs'
import { isoAgo, isoDaysFromNow, todayISO } from '../lib/date'
import { mulberry32 } from '../lib/util'
import { photoPlaceholderSvg, svgBlob, typicalFloorSvg } from '../lib/planSvg'
import type {
  ActivityRow, Attachment, CommentRow, Company, DailyLog, Defect, DefectStatus,
  LocationNode, NotificationRow, Plan, PlanVersion, Project, ProjectMember,
  Severity, Task, TaskStatus, User,
} from './types'

const SEED_VERSION = '1'

function base(id: string, createdDaysAgo = 60, by = 'u-alon') {
  const t = isoAgo(createdDaysAgo)
  return { id, created_at: t, created_by: by, updated_at: t, updated_by: by, archived_at: null }
}

export async function seedIfNeeded(): Promise<void> {
  const v = await db.meta.get('seed_version')
  if (v?.value === SEED_VERSION) return
  await clearAll()
  await seed()
}

export async function resetDemo(): Promise<void> {
  await clearAll()
  await seed()
}

async function clearAll() {
  await Promise.all(db.tables.map(t => t.clear()))
}

async function seed() {
  // --- חברות ---
  const companies: Company[] = [
    { ...base('c-main', 400), name: 'אורבן הנדסה בע"מ', type: 'owner', contact_name: 'משרד ראשי', phone: '03-5551234' },
    { ...base('c-el', 300), name: 'חשמל כהן', type: 'contractor', contact_name: 'סמי כהן', phone: '050-5551111' },
    { ...base('c-pl', 300), name: 'אינסטלציה לוי ובניו', type: 'contractor', contact_name: 'אבי לוי', phone: '050-5552222' },
    { ...base('c-al', 280), name: 'אלומיניום ברק', type: 'contractor', contact_name: 'ברק שגב', phone: '050-5553333' },
    { ...base('c-fl', 280), name: 'ריצוף מזרחי', type: 'contractor', contact_name: 'דוד מזרחי', phone: '050-5554444' },
    { ...base('c-gn', 280), name: 'גמר הבניין בע"מ', type: 'contractor', contact_name: 'רמי גל', phone: '050-5555555' },
  ]

  // --- משתמשים ---
  const users: User[] = [
    { ...base('u-alon', 400), full_name: 'אלון', email: 'alon@buildflow.demo', company_id: 'c-main', role: 'admin', color: '#1d5c8f', is_active: true },
    { ...base('u-ronit', 350), full_name: 'רונית לביא', email: 'ronit@buildflow.demo', company_id: 'c-main', role: 'pm', color: '#7c3aed', is_active: true },
    { ...base('u-yossi', 350), full_name: 'יוסי פרץ', email: 'yossi@buildflow.demo', company_id: 'c-main', role: 'supervisor', color: '#0d9488', is_active: true },
    { ...base('u-sami', 300), full_name: 'סמי כהן', email: 'sami@hashmal-cohen.demo', company_id: 'c-el', role: 'contractor', color: '#ea580c', is_active: true },
    { ...base('u-avi', 300), full_name: 'אבי לוי', email: 'avi@levi-pipes.demo', company_id: 'c-pl', role: 'contractor', color: '#b45309', is_active: true },
  ]

  // --- פרויקט ---
  const project: Project = {
    ...base('p-1', 220, 'u-ronit'),
    company_id: 'c-main',
    name: 'מגדלי הפארק — בניין A',
    code: 'PRK-A',
    type: 'residential',
    address: 'רחוב הבנים 12',
    city: 'רעננה',
    start_date: isoAgo(200).slice(0, 10),
    end_date: isoDaysFromNow(280),
    status: 'active',
    pm_user_id: 'u-ronit',
    progress_pct: 46,
  }

  const members: ProjectMember[] = users.map((u, i) => ({ ...base(`m-${i}`, 200), project_id: 'p-1', user_id: u.id }))

  // --- עץ מיקומים ---
  const locations: LocationNode[] = []
  let sort = 0
  const addLoc = (id: string, parent: LocationNode | null, type: LocationNode['type'], name: string, code?: string, plan_id?: string | null): LocationNode => {
    const node: LocationNode = {
      ...base(id, 200, 'u-ronit'),
      project_id: 'p-1',
      parent_id: parent?.id ?? null,
      type, name, code,
      sort_order: sort++,
      path: parent ? `${parent.path}/${id}` : `/${id}`,
      depth: parent ? parent.depth + 1 : 0,
      plan_id: plan_id ?? null,
    }
    locations.push(node)
    return node
  }

  const site = addLoc('loc-site', null, 'site', 'אתר הפארק')
  const bldg = addLoc('loc-b1', site, 'building', 'בניין A', 'A')

  const SPACES = ['סלון', 'מטבח', 'ממ"ד', 'חדר רחצה', 'מרפסת']
  const ground = addLoc('loc-f0', bldg, 'floor', 'קומת קרקע', 'F0')
  addLoc('loc-f0-s1', ground, 'space', 'לובי כניסה')
  addLoc('loc-f0-s2', ground, 'space', 'חדר עגלות')
  addLoc('loc-f0-s3', ground, 'space', 'חדר חשמל')

  for (let f = 1; f <= 6; f++) {
    const floor = addLoc(`loc-f${f}`, bldg, 'floor', `קומה ${f}`, `F${f}`, 'pl-1')
    addLoc(`loc-f${f}-lobby`, floor, 'space', 'לובי קומתי')
    for (let u = 1; u <= 4; u++) {
      const unit = addLoc(`loc-f${f}-u${u}`, floor, 'unit', `דירה ${u}`, `F${f}-U${u}`)
      SPACES.forEach((s, k) => addLoc(`loc-f${f}-u${u}-s${k}`, unit, 'space', s))
    }
  }

  // --- תוכנית קומה טיפוסית ---
  await putBlob(svgBlob(typicalFloorSvg()), 'blob-plan-1')
  const plan: Plan = {
    ...base('pl-1', 190, 'u-ronit'),
    project_id: 'p-1', name: 'תוכנית קומה טיפוסית', discipline: 'architecture',
    sheet_number: 'A-101', current_version_id: 'plv-1',
  }
  const planVersion: PlanVersion = {
    ...base('plv-1', 190, 'u-ronit'),
    plan_id: 'pl-1', version_number: 1, blob_id: 'blob-plan-1',
    file_type: 'svg', width_px: 1600, height_px: 1100, is_current: true,
  }

  // --- תמונות דמו ---
  const photoIds: string[] = []
  const photoLabels = ['ריצוף בסלון', 'קיר לאחר טיח', 'ארון חשמל', 'צנרת מים']
  for (let i = 0; i < 4; i++) {
    const id = `blob-ph-${i}`
    await putBlob(svgBlob(photoPlaceholderSvg(photoLabels[i], [30, 200, 220, 15][i])), id)
    photoIds.push(id)
  }

  // --- ליקויים ---
  // מרכזי רבעי הדירות בתוכנית (יחסי 0–1) + פיזור דטרמיניסטי
  const APT_CENTER: Record<number, [number, number]> = {
    1: [0.25, 0.32], 2: [0.75, 0.32], 3: [0.25, 0.69], 4: [0.75, 0.69],
  }
  const rnd = mulberry32(42)
  const pin = (apt: number): [number, number] => {
    const [cx, cy] = APT_CENTER[apt]
    return [cx + (rnd() - 0.5) * 0.14, cy + (rnd() - 0.5) * 0.12]
  }

  type DSeed = {
    title: string; f: number; u: number; type: string; sev: Severity
    status: DefectStatus; due: number | null; company: string; user?: string
    ago: number; desc?: string; photos?: number
  }
  const dseeds: DSeed[] = [
    { title: 'ריצוף שקוע בסלון', f: 3, u: 2, type: 'ריצוף', sev: 'high', status: 'open', due: -3, company: 'c-fl', ago: 12, desc: 'שקיעה ניכרת של אריחים במרכז הסלון, כ-4 אריחים.', photos: 1 },
    { title: 'סדק בטיח בתקרת חדר שינה', f: 2, u: 1, type: 'טיח', sev: 'medium', status: 'open', due: 5, company: 'c-gn', ago: 8, photos: 1 },
    { title: 'כשל איטום במרפסת — סימני רטיבות', f: 5, u: 3, type: 'איטום', sev: 'high', status: 'open', due: -7, company: 'c-gn', ago: 18, desc: 'רטיבות בתקרת המרפסת של הדירה מתחת.', photos: 1 },
    { title: 'שקע חשמל רופף במטבח', f: 1, u: 1, type: 'חשמל', sev: 'medium', status: 'open', due: 4, company: 'c-el', user: 'u-sami', ago: 5 },
    { title: 'דלת ממ"ד לא נסגרת', f: 4, u: 4, type: 'אלומיניום', sev: 'high', status: 'open', due: 7, company: 'c-al', ago: 6 },
    { title: 'נזילה מתחת לכיור מטבח', f: 2, u: 3, type: 'אינסטלציה', sev: 'critical', status: 'open', due: 1, company: 'c-pl', user: 'u-avi', ago: 2, desc: 'נזילה פעילה. סוגר מים ראשי לדירה.', photos: 1 },
    { title: 'שריטה בפרופיל חלון סלון', f: 6, u: 2, type: 'אלומיניום', sev: 'low', status: 'open', due: 14, company: 'c-al', ago: 4 },
    { title: 'צנרת ניקוז בשיפוע שגוי', f: 1, u: 2, type: 'אינסטלציה', sev: 'high', status: 'in_progress', due: 2, company: 'c-pl', user: 'u-avi', ago: 9, photos: 1 },
    { title: 'חוסר אריחים במרפסת שירות', f: 3, u: 1, type: 'ריצוף', sev: 'medium', status: 'in_progress', due: 6, company: 'c-fl', ago: 7 },
    { title: 'תיקון טיח בפינת ממ"ד', f: 2, u: 2, type: 'טיח', sev: 'low', status: 'in_progress', due: 8, company: 'c-gn', ago: 10 },
    { title: 'החלפת זכוכית סדוקה בחדר שינה', f: 5, u: 1, type: 'אלומיניום', sev: 'medium', status: 'in_progress', due: 3, company: 'c-al', ago: 11, photos: 1 },
    { title: 'הזזת נקודת חשמל בסלון', f: 4, u: 3, type: 'חשמל', sev: 'medium', status: 'in_progress', due: 5, company: 'c-el', user: 'u-sami', ago: 6 },
    { title: 'איטום חדר רחצה הורים', f: 1, u: 3, type: 'איטום', sev: 'high', status: 'ready_for_review', due: 0, company: 'c-gn', ago: 15, photos: 2 },
    { title: 'תיקון ריצוף במטבח', f: 2, u: 4, type: 'ריצוף', sev: 'medium', status: 'ready_for_review', due: 1, company: 'c-fl', ago: 13, photos: 2 },
    { title: 'סידור לוח חשמל דירתי', f: 3, u: 3, type: 'חשמל', sev: 'high', status: 'ready_for_review', due: 2, company: 'c-el', user: 'u-sami', ago: 14, photos: 1 },
    { title: 'כיוון דלת כניסה', f: 6, u: 4, type: 'נגרות', sev: 'low', status: 'ready_for_review', due: 3, company: 'c-al', ago: 9 },
    { title: 'סתימה בניקוז מרפסת', f: 4, u: 1, type: 'אינסטלציה', sev: 'high', status: 'rejected', due: 1, company: 'c-pl', user: 'u-avi', ago: 16, desc: 'בבדיקה חוזרת עדיין מצטברים מים.', photos: 1 },
    { title: 'צבע מתקלף בקיר סלון', f: 5, u: 2, type: 'צבע', sev: 'medium', status: 'rejected', due: 2, company: 'c-gn', ago: 12 },
    { title: 'איטום סף מרפסת', f: 1, u: 4, type: 'איטום', sev: 'medium', status: 'closed', due: -6, company: 'c-gn', ago: 30, photos: 2 },
    { title: 'החלפת אריח שבור במסדרון', f: 2, u: 2, type: 'ריצוף', sev: 'low', status: 'closed', due: -10, company: 'c-fl', ago: 28, photos: 2 },
    { title: 'חיזוק מעקה מרפסת', f: 3, u: 4, type: 'אלומיניום', sev: 'critical', status: 'closed', due: -15, company: 'c-al', ago: 35, photos: 2 },
    { title: 'תיקון נקודת תאורה בממ"ד', f: 4, u: 2, type: 'חשמל', sev: 'low', status: 'closed', due: -8, company: 'c-el', user: 'u-sami', ago: 25 },
    { title: 'ברז ניל בחדר רחצה מטפטף', f: 6, u: 1, type: 'אינסטלציה', sev: 'low', status: 'closed', due: -4, company: 'c-pl', user: 'u-avi', ago: 20 },
    { title: 'פריט כפול — נפתח בטעות', f: 1, u: 1, type: 'אחר', sev: 'low', status: 'cancelled', due: null, company: 'c-fl', ago: 22 },
  ]

  const defects: Defect[] = []
  const activity: ActivityRow[] = []
  const attachments: Attachment[] = []
  let photoCursor = 0
  let actSeq = 0

  const pushAct = (d: Defect, action: ActivityRow['action'], at: string, actor: string, oldV?: string | null, newV?: string | null) => {
    activity.push({
      ...base(`act-${actSeq++}`, 0, actor), created_at: at, updated_at: at, at,
      project_id: 'p-1', entity_type: 'defect', entity_id: d.id,
      action, old_value: oldV ?? null, new_value: newV ?? null,
    })
  }

  dseeds.forEach((s, i) => {
    const id = `d-${i + 1}`
    const [px, py] = pin(s.u)
    const createdAt = isoAgo(s.ago)
    const creator = i % 3 === 0 ? 'u-ronit' : 'u-yossi'
    const d: Defect = {
      ...base(id, s.ago, creator),
      project_id: 'p-1', number: i + 1, title: s.title, description: s.desc,
      location_id: `loc-f${s.f}-u${s.u}`,
      pin_x: px, pin_y: py, plan_version_id: 'plv-1',
      dtype: s.type, severity: s.sev, status: s.status,
      assigned_company_id: s.company, assigned_user_id: s.user ?? null,
      due_date: s.due == null ? null : isoDaysFromNow(s.due),
      closed_at: s.status === 'closed' ? isoAgo(Math.max(1, s.ago - 6)) : null,
      closed_by: s.status === 'closed' ? 'u-yossi' : null,
      reopen_count: 0,
    }
    defects.push(d)

    // היסטוריה עקבית עם הסטטוס
    pushAct(d, 'created', createdAt, creator)
    pushAct(d, 'assigned', isoAgo(s.ago, -2), creator, null, s.company)
    const chain: DefectStatus[] =
      s.status === 'in_progress' ? ['in_progress']
      : s.status === 'ready_for_review' ? ['in_progress', 'ready_for_review']
      : s.status === 'rejected' ? ['in_progress', 'ready_for_review', 'rejected']
      : s.status === 'closed' ? ['in_progress', 'ready_for_review', 'closed']
      : s.status === 'cancelled' ? ['cancelled']
      : []
    let prev: DefectStatus = 'open'
    chain.forEach((st, k) => {
      const actor = st === 'ready_for_review' ? (s.user ?? 'u-avi') : st === 'in_progress' ? (s.user ?? 'u-avi') : 'u-yossi'
      pushAct(d, 'status_changed', isoAgo(Math.max(0, s.ago - 2 - k * 2)), actor, prev, st)
      prev = st
    })

    // תמונות
    const n = s.photos ?? 0
    for (let p = 0; p < n; p++) {
      const bid = photoIds[photoCursor++ % photoIds.length]
      attachments.push({
        ...base(`att-${id}-${p}`, s.ago, creator),
        project_id: 'p-1', entity_type: 'defect', entity_id: id, kind: 'photo',
        blob_id: bid, thumb_blob_id: bid, file_name: `IMG_${1000 + i * 3 + p}.jpg`,
        mime_type: 'image/svg+xml', width: 800, height: 600,
        taken_at: isoAgo(s.ago, p), location_id: d.location_id,
        phase: n === 2 ? (p === 0 ? 'before' : 'after') : 'before',
      })
    }
  })

  // --- תגובות ---
  const comments: CommentRow[] = [
    { ...base('cm-1', 2, 'u-yossi'), project_id: 'p-1', entity_type: 'defect', entity_id: 'd-6', body: 'נזילה פעילה — נא לטפל עוד היום. סגרתי מים ראשי לדירה.' },
    { ...base('cm-2', 1, 'u-avi'), project_id: 'p-1', entity_type: 'defect', entity_id: 'd-6', body: 'מגיע מחר ב-07:00 עם צוות. מביא חלקים.' },
    { ...base('cm-3', 3, 'u-sami'), project_id: 'p-1', entity_type: 'defect', entity_id: 'd-15', body: 'הלוח סודר וסומן. מצורפת תמונה — מוכן לבדיקה.' },
    { ...base('cm-4', 5, 'u-yossi'), project_id: 'p-1', entity_type: 'defect', entity_id: 'd-17', body: 'בבדיקה חוזרת עדיין מצטברים מים במרפסת. מחזיר לתיקון.' },
  ]

  // --- משימות ---
  type TSeed = { title: string; status: TaskStatus; due: number | null; pr: Task['priority']; company?: string; loc?: string; ago: number; prog?: number; blocked?: string }
  const tseeds: TSeed[] = [
    { title: 'פינוי פסולת בניין — קומה 3', status: 'in_progress', due: 1, pr: 'high', company: 'c-gn', loc: 'loc-f3', ago: 4, prog: 50 },
    { title: 'סימון תוואי חשמל — קומה 5', status: 'new', due: 3, pr: 'normal', company: 'c-el', loc: 'loc-f5', ago: 2 },
    { title: 'בדיקת לחץ קו מים ראשי', status: 'review', due: 0, pr: 'high', company: 'c-pl', ago: 6, prog: 100 },
    { title: 'התקנת מעקות מרפסת — קומת קרקע', status: 'blocked', due: 5, pr: 'high', company: 'c-al', loc: 'loc-f0', ago: 8, blocked: 'ממתין לאספקת פרופילים' },
    { title: 'ניקיון לובי קומתי — קומה 2', status: 'done', due: -2, pr: 'low', company: 'c-gn', loc: 'loc-f2', ago: 10, prog: 100 },
    { title: 'עדכון תוכנית חשמל דירה F3-U3', status: 'new', due: 4, pr: 'normal', ago: 1 },
    { title: 'הזמנת חומרי איטום לגג', status: 'done', due: -5, pr: 'normal', company: 'c-gn', ago: 14, prog: 100 },
    { title: 'תיאום מנוף לשבוע הבא', status: 'in_progress', due: 2, pr: 'high', ago: 3, prog: 30 },
  ]
  const tasks: Task[] = tseeds.map((s, i) => ({
    ...base(`t-${i + 1}`, s.ago, 'u-ronit'),
    project_id: 'p-1', number: i + 1, title: s.title,
    location_id: s.loc ?? null, status: s.status, priority: s.pr,
    assigned_company_id: s.company ?? null, assigned_user_id: null,
    due_date: s.due == null ? null : isoDaysFromNow(s.due),
    progress_pct: s.prog ?? 0, blocked_reason: s.blocked,
  }))

  // --- יומני עבודה ---
  const logs: DailyLog[] = [
    {
      ...base('dl-1', 1, 'u-yossi'),
      project_id: 'p-1', date: isoDaysFromNow(-1), weather: 'clear', temp_c: 31,
      hours_from: '07:00', hours_to: '16:00',
      manpower: [
        { company_id: 'c-gn', trade: 'טיח וגמר', count: 6 },
        { company_id: 'c-el', trade: 'חשמל', count: 3 },
        { company_id: 'c-pl', trade: 'אינסטלציה', count: 2 },
      ],
      equipment: ['מנוף צריח', 'מערבל בטון'],
      work_performed: 'המשך עבודות טיח בקומות 4–5. השחלות חשמל בקומה 6. התחלת ריצוף בקומה 2.',
      deliveries: 'אספקת אריחים לקומות 2–3 (16 משטחים).',
      delays: '',
      safety_events: '',
      visitors: 'ביקור מתכנן קונסטרוקציה — אישור פרט חיזוק במרפסות.',
      notes: '',
      status: 'locked', locked_at: isoAgo(0, 14), locked_by: 'u-ronit',
    },
    {
      ...base('dl-2', 0, 'u-yossi'),
      project_id: 'p-1', date: todayISO(), weather: 'clear', temp_c: 33,
      hours_from: '07:00', hours_to: '',
      manpower: [
        { company_id: 'c-gn', trade: 'טיח וגמר', count: 5 },
        { company_id: 'c-fl', trade: 'ריצוף', count: 4 },
      ],
      equipment: ['מנוף צריח'],
      work_performed: 'ריצוף קומה 2 — דירות 1–2. תיקוני טיח קומה 3.',
      status: 'draft', locked_at: null, locked_by: null,
    },
  ]

  // --- התראות ---
  const notifications: NotificationRow[] = [
    { ...base('n-1', 0, 'system'), user_id: 'u-sami', ntype: 'assigned', title: 'הוקצה לך ליקוי #4 — שקע חשמל רופף במטבח', entity_type: 'defect', entity_id: 'd-4', project_id: 'p-1', read_at: null },
    { ...base('n-2', 1, 'system'), user_id: 'u-sami', ntype: 'assigned', title: 'הוקצה לך ליקוי #12 — הזזת נקודת חשמל בסלון', entity_type: 'defect', entity_id: 'd-12', project_id: 'p-1', read_at: null },
    { ...base('n-3', 0, 'system'), user_id: 'u-yossi', ntype: 'review', title: 'ליקוי #15 ממתין לבדיקתך — סידור לוח חשמל דירתי', entity_type: 'defect', entity_id: 'd-15', project_id: 'p-1', read_at: null },
    { ...base('n-4', 0, 'system'), user_id: 'u-ronit', ntype: 'overdue', title: 'ליקוי #1 עבר את מועד היעד — ריצוף שקוע בסלון', entity_type: 'defect', entity_id: 'd-1', project_id: 'p-1', read_at: null },
    { ...base('n-5', 2, 'system'), user_id: 'u-avi', ntype: 'rejected', title: 'ליקוי #17 נדחה בבדיקה — סתימה בניקוז מרפסת', entity_type: 'defect', entity_id: 'd-17', project_id: 'p-1', read_at: isoAgo(1) },
    { ...base('n-6', 3, 'system'), user_id: 'u-alon', ntype: 'summary', title: 'ברוך הבא ל-BuildFlow! זהו פרויקט הדמו שלך.', project_id: 'p-1', read_at: null },
  ]

  await db.transaction('rw', db.tables, async () => {
    await db.companies.bulkAdd(companies)
    await db.users.bulkAdd(users)
    await db.projects.add(project)
    await db.members.bulkAdd(members)
    await db.locations.bulkAdd(locations)
    await db.plans.add(plan)
    await db.plan_versions.add(planVersion)
    await db.defects.bulkAdd(defects)
    await db.activity.bulkAdd(activity)
    await db.attachments.bulkAdd(attachments)
    await db.comments.bulkAdd(comments)
    await db.tasks.bulkAdd(tasks)
    await db.daily_logs.bulkAdd(logs)
    await db.notifications.bulkAdd(notifications)
    await db.meta.put({ key: 'seed_version', value: SEED_VERSION })
  })
}
