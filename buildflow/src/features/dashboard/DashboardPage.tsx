import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, ArrowLeft, CalendarDays, Camera, CheckCircle2, ClipboardList, Clock, ListTodo } from 'lucide-react'
import { db } from '../../data/db'
import { useProject } from '../shell/ProjectContext'
import { Badge, Card, Spinner } from '../../components/ui'
import { BlobImg } from '../../components/BlobImg'
import { STATUS_BADGE, STATUS_HEX, STATUS_LABEL } from '../../lib/labels'
import { isOverdue, OPEN_STATUSES } from '../../lib/status'
import { can, visibleToUser } from '../../lib/permissions'
import { daysUntil, fmtRel, todayISO } from '../../lib/date'
import { cx } from '../../lib/util'
import type { DefectStatus } from '../../data/types'

function Kpi({ label, value, tone, icon, onClick, sub }: {
  label: string; value: string | number; tone?: 'danger' | 'warn' | 'ok' | 'brand'
  icon?: React.ReactNode; onClick?: () => void; sub?: string
}) {
  const toneCls = { danger: 'text-st-open', warn: 'text-amber-600', ok: 'text-st-closed', brand: 'text-brand' }[tone ?? 'brand']
  return (
    <Card onClick={onClick} className="p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between text-slate-400">{icon}<span className="text-xs">{label}</span></div>
      <div className={cx('text-3xl font-extrabold ltr-num', toneCls)}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </Card>
  )
}

/** גרף קו קטן — נפתח מול נסגר, 8 שבועות */
function Trend({ created, closed }: { created: number[]; closed: number[] }) {
  const W = 280, H = 70, max = Math.max(1, ...created, ...closed)
  const pts = (arr: number[]) => arr.map((v, i) => `${(i / (arr.length - 1)) * W},${H - (v / max) * (H - 8) - 4}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16">
      <polyline points={pts(created)} fill="none" stroke={STATUS_HEX.open} strokeWidth="2.5" strokeLinejoin="round" />
      <polyline points={pts(closed)} fill="none" stroke={STATUS_HEX.closed} strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  )
}

export function DashboardPage() {
  const { project, me, href, companyMap, locations, locMap, locName } = useProject()
  const navigate = useNavigate()

  const data = useLiveQuery(async () => {
    const [defects, tasks, attachments, logs, activity] = await Promise.all([
      db.defects.where('project_id').equals(project.id).and(d => !d.archived_at).toArray(),
      db.tasks.where('project_id').equals(project.id).and(t => !t.archived_at).toArray(),
      db.attachments.where('project_id').equals(project.id).toArray(),
      db.daily_logs.where('project_id').equals(project.id).toArray(),
      db.activity.where('project_id').equals(project.id).toArray(),
    ])
    return { defects, tasks, attachments, logs, activity }
  }, [project.id])

  const calc = useMemo(() => {
    if (!data) return null
    const defects = visibleToUser(me, data.defects)
    const tasks = visibleToUser(me, data.tasks)
    const open = defects.filter(d => OPEN_STATUSES.includes(d.status))
    const overdue = defects.filter(isOverdue)
    const review = defects.filter(d => d.status === 'ready_for_review')
    const openTasks = tasks.filter(t => t.status !== 'done')

    const byStatus = (['open', 'in_progress', 'ready_for_review', 'rejected', 'closed', 'cancelled'] as DefectStatus[])
      .map(s => ({ s, n: defects.filter(d => d.status === s).length }))

    const byCompany = [...companyMap.values()]
      .filter(c => c.type === 'contractor')
      .map(c => ({ c, n: open.filter(d => d.assigned_company_id === c.id).length }))
      .filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 5)

    const floorOf = (locId: string) => {
      let cur = locMap.get(locId)
      while (cur && cur.type !== 'floor') cur = cur.parent_id ? locMap.get(cur.parent_id) : undefined
      return cur
    }
    const floors = locations.filter(l => l.type === 'floor')
    const byFloor = floors.map(f => ({ f, n: open.filter(d => floorOf(d.location_id)?.id === f.id).length }))

    // מגמה — 8 שבועות אחרונים
    const weeks = 8
    const created: number[] = Array(weeks).fill(0)
    const closedArr: number[] = Array(weeks).fill(0)
    const now = Date.now()
    const wk = (iso?: string | null) => iso ? Math.floor((now - new Date(iso).getTime()) / (7 * 864e5)) : -1
    defects.forEach(d => {
      const cw = wk(d.created_at); if (cw >= 0 && cw < weeks) created[weeks - 1 - cw]++
      const zw = wk(d.closed_at); if (zw >= 0 && zw < weeks) closedArr[weeks - 1 - zw]++
    })

    const urgent = [...overdue].sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? '')).slice(0, 5)
    const recentAct = [...data.activity].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 7)
    const photos = [...data.attachments].filter(a => a.kind === 'photo').sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6)
    const todayLog = data.logs.find(l => l.date === todayISO())
    return { defects, open, overdue, review, openTasks, byStatus, byCompany, byFloor, created, closedArr, urgent, recentAct, photos, todayLog }
  }, [data, me, companyMap, locations, locMap])

  if (!calc) return <Spinner />
  const full = can(me, 'dashboard:full')
  const dLeft = daysUntil(project.end_date)
  const maxCompany = Math.max(1, ...calc.byCompany.map(x => x.n))
  const maxFloor = Math.max(1, ...calc.byFloor.map(x => x.n))
  const total = calc.defects.length || 1

  const goDefects = (q: string) => navigate(href('defects') + q)

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-extrabold">{full ? 'דשבורד הפרויקט' : 'העבודה שלי'}</h1>
        <span className="text-xs text-slate-400">{full ? '' : `${companyMap.get(me.company_id)?.name ?? ''} · מוצגים פריטים שהוקצו לחברה שלך`}</span>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi label="התקדמות" value={`${project.progress_pct}%`} tone="brand" icon={<CheckCircle2 size={15} />} />
        <Kpi label="ליקויים פתוחים" value={calc.open.length} tone="danger" icon={<ClipboardList size={15} />} onClick={() => goDefects('')} />
        <Kpi label="באיחור" value={calc.overdue.length} tone={calc.overdue.length ? 'danger' : 'ok'} icon={<AlertTriangle size={15} />} onClick={() => goDefects('?f=overdue')} />
        <Kpi label="ממתינים לבדיקה" value={calc.review.length} tone="warn" icon={<Clock size={15} />} onClick={() => goDefects('?st=ready_for_review')} />
        <Kpi label="משימות פתוחות" value={calc.openTasks.length} tone="brand" icon={<ListTodo size={15} />} onClick={() => navigate(href('tasks'))} />
        <Kpi label="ימים לסיום יעד" value={dLeft ?? '—'} tone={dLeft != null && dLeft < 30 ? 'warn' : 'brand'} icon={<CalendarDays size={15} />} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* התפלגות סטטוסים */}
        <Card className="p-4">
          <h3 className="font-bold text-sm mb-3">ליקויים לפי סטטוס</h3>
          <div className="h-4 rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-800" dir="ltr">
            {calc.byStatus.filter(x => x.n > 0).map(x => (
              <div key={x.s} style={{ width: `${(x.n / total) * 100}%`, backgroundColor: STATUS_HEX[x.s] }} title={`${STATUS_LABEL[x.s]}: ${x.n}`} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
            {calc.byStatus.map(x => (
              <button key={x.s} onClick={() => goDefects(`?st=${x.s}`)} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_HEX[x.s] }} />
                {STATUS_LABEL[x.s]} <b className="ltr-num">{x.n}</b>
              </button>
            ))}
          </div>
        </Card>

        {/* מגמה */}
        <Card className="p-4">
          <h3 className="font-bold text-sm mb-1">נפתחו מול נסגרו — 8 שבועות</h3>
          <div className="flex gap-4 text-[11px] text-slate-400 mb-1">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-st-open" /> נפתחו</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-st-closed" /> נסגרו</span>
          </div>
          <Trend created={calc.created} closed={calc.closedArr} />
        </Card>

        {full && calc.byCompany.length > 0 && (
          <Card className="p-4">
            <h3 className="font-bold text-sm mb-3">פתוחים לפי קבלן</h3>
            <div className="space-y-2">
              {calc.byCompany.map(({ c, n }) => (
                <button key={c.id} onClick={() => goDefects(`?co=${c.id}`)} className="w-full">
                  <div className="flex justify-between text-xs mb-0.5"><span className="font-medium">{c.name}</span><b className="ltr-num">{n}</b></div>
                  <div className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-brand rounded-full" style={{ width: `${(n / maxCompany) * 100}%` }} />
                  </div>
                </button>
              ))}
            </div>
          </Card>
        )}

        {full && (
          <Card className="p-4">
            <h3 className="font-bold text-sm mb-3">פתוחים לפי קומה</h3>
            <div className="flex flex-wrap gap-2">
              {calc.byFloor.map(({ f, n }) => (
                <button key={f.id} onClick={() => goDefects(`?loc=${f.id}`)}
                  className="px-3 py-2 rounded-lg border text-xs font-medium"
                  style={{
                    backgroundColor: n ? `rgba(220,38,38,${0.08 + 0.5 * (n / maxFloor)})` : undefined,
                    borderColor: n ? 'rgba(220,38,38,0.35)' : 'rgb(203,213,225)',
                  }}>
                  {f.name} <b className="ltr-num">{n}</b>
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* דחופים */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm">חריגות דחופות</h3>
            <button onClick={() => goDefects('?f=overdue')} className="text-xs text-brand flex items-center gap-1">הכול <ArrowLeft size={12} /></button>
          </div>
          {calc.urgent.length === 0 ? (
            <div className="text-sm text-slate-400 py-4 text-center">אין פריטים באיחור 🎉</div>
          ) : (
            <div className="space-y-2">
              {calc.urgent.map(d => (
                <Link key={d.id} to={href(`defects/${d.id}`)} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
                  <Badge className={STATUS_BADGE[d.status]}>#{d.number}</Badge>
                  <span className="flex-1 text-sm font-medium truncate">{d.title}</span>
                  <span className="text-[11px] text-st-open font-bold whitespace-nowrap">{Math.abs(daysUntil(d.due_date) ?? 0)} ימי איחור</span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* פעילות אחרונה */}
        <Card className="p-4">
          <h3 className="font-bold text-sm mb-3">פעילות אחרונה</h3>
          <div className="space-y-2.5">
            {calc.recentAct.map(a => (
              <div key={a.id} className="flex items-start gap-2 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-brand mt-1.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <ActLine actId={a.entity_id} action={a.action} oldV={a.old_value} newV={a.new_value} />
                  <div className="text-slate-400 text-[10px]">{fmtRel(a.at)}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* תמונות + יומן */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm">תמונות אחרונות</h3>
            <Link to={href('photos')} className="text-xs text-brand flex items-center gap-1"><Camera size={12} /> גלריה</Link>
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {calc.photos.map(p => <BlobImg key={p.id} blobId={p.thumb_blob_id ?? p.blob_id} className="aspect-square rounded-lg w-full" />)}
          </div>
        </Card>
        <Card className="p-4 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm">יומן עבודה — היום</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {calc.todayLog ? (calc.todayLog.status === 'locked' ? 'מולא וננעל' : calc.todayLog.status === 'submitted' ? 'הוגש לאישור' : 'טיוטה פתוחה') : 'טרם מולא'}
            </p>
          </div>
          <Link to={href('log')}>
            <Badge className={calc.todayLog ? 'bg-st-closed/10 text-st-closed border-st-closed/30' : 'bg-amber-50 text-amber-600 border-amber-200'}>
              {calc.todayLog ? '✓ פתח יומן' : 'מלא עכשיו'}
            </Badge>
          </Link>
        </Card>
      </div>
      <span className="hidden">{locName('')}</span>
    </div>
  )
}

function ActLine({ actId, action, oldV, newV }: { actId: string; action: string; oldV?: string | null; newV?: string | null }) {
  const d = useLiveQuery(() => db.defects.get(actId), [actId])
  const label =
    action === 'created' ? 'נפתח' :
    action === 'status_changed' ? `${STATUS_LABEL[(oldV ?? 'open') as DefectStatus] ?? oldV} ← ${STATUS_LABEL[(newV ?? 'open') as DefectStatus] ?? newV}` :
    action === 'assigned' ? 'הוקצה לקבלן' :
    action === 'commented' ? 'תגובה חדשה' :
    action === 'attachment_added' ? 'נוספו תמונות' : action
  return <span className="text-slate-600 dark:text-slate-300">{d ? <b>#{d.number} {d.title}</b> : 'פריט'} — {label}</span>
}
