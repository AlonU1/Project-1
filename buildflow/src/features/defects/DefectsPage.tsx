import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ClipboardList, LayoutGrid, List, MessageSquare, Plus, Search } from 'lucide-react'
import { db } from '../../data/db'
import { useProject } from '../shell/ProjectContext'
import { Badge, Btn, Card, Chip, EmptyState, Input, Select, Spinner } from '../../components/ui'
import { BlobImg } from '../../components/BlobImg'
import { DEFECT_TYPES, SEVERITY_DOT, SEVERITY_LABEL, STATUS_BADGE, STATUS_HEX, STATUS_LABEL } from '../../lib/labels'
import { can, visibleToUser } from '../../lib/permissions'
import { isOverdue } from '../../lib/status'
import { daysUntil, fmtDate } from '../../lib/date'
import { cx } from '../../lib/util'
import type { Defect, DefectStatus } from '../../data/types'

export function DefectsPage() {
  const { project, me, href, contractors, locMap, locName } = useProject()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [view, setView] = useState<'list' | 'board'>('list')
  const [search, setSearch] = useState('')
  const [statuses, setStatuses] = useState<DefectStatus[]>(() => {
    const st = params.get('st')
    return st ? [st as DefectStatus] : []
  })
  const [overdueOnly, setOverdueOnly] = useState(params.get('f') === 'overdue')
  const [mineOnly, setMineOnly] = useState(false)
  const [companyId, setCompanyId] = useState(params.get('co') ?? '')
  const [dtype, setDtype] = useState('')
  const locFilter = params.get('loc') ?? ''

  const data = useLiveQuery(async () => {
    const [defects, attachments, comments] = await Promise.all([
      db.defects.where('project_id').equals(project.id).and(d => !d.archived_at).toArray(),
      db.attachments.where('project_id').equals(project.id).toArray(),
      db.comments.filter(c => c.project_id === project.id && c.entity_type === 'defect').toArray(),
    ])
    return { defects, attachments, comments }
  }, [project.id])

  const rows = useMemo(() => {
    if (!data) return null
    const thumb = new Map<string, string>()
    for (const a of data.attachments) {
      if (a.entity_type === 'defect' && !thumb.has(a.entity_id)) thumb.set(a.entity_id, a.thumb_blob_id ?? a.blob_id)
    }
    const commentCount = new Map<string, number>()
    for (const c of data.comments) commentCount.set(c.entity_id, (commentCount.get(c.entity_id) ?? 0) + 1)

    let list = visibleToUser(me, data.defects)
    if (statuses.length) list = list.filter(d => statuses.includes(d.status))
    if (overdueOnly) list = list.filter(isOverdue)
    if (mineOnly) list = list.filter(d => d.created_by === me.id || d.assigned_user_id === me.id)
    if (companyId) list = list.filter(d => d.assigned_company_id === companyId)
    if (dtype) list = list.filter(d => d.dtype === dtype)
    if (locFilter) list = list.filter(d => locMap.get(d.location_id)?.path.includes(locFilter))
    if (search.trim()) {
      const q = search.trim()
      list = list.filter(d => d.title.includes(q) || String(d.number) === q.replace('#', '') || (d.description ?? '').includes(q))
    }
    list.sort((a, b) => b.number - a.number)
    return { list, thumb, commentCount, total: visibleToUser(me, data.defects).length }
  }, [data, me, statuses, overdueOnly, mineOnly, companyId, dtype, search, locFilter, locMap])

  if (!rows) return <Spinner />

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h1 className="text-lg font-extrabold">ליקויים <span className="text-sm font-normal text-slate-400 ltr-num">{rows.list.length}/{rows.total}</span></h1>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex rounded-lg border border-slate-300 dark:border-slate-600 overflow-hidden">
            <button onClick={() => setView('list')} className={cx('p-2', view === 'list' ? 'bg-brand text-white' : 'bg-white dark:bg-slate-800')}><List size={15} /></button>
            <button onClick={() => setView('board')} className={cx('p-2', view === 'board' ? 'bg-brand text-white' : 'bg-white dark:bg-slate-800')}><LayoutGrid size={15} /></button>
          </div>
          {can(me, 'defect:create') && (
            <Btn variant="primary" onClick={() => navigate(href('defects/new') + (locFilter ? `?loc=${locFilter}` : ''))}><Plus size={15} /> ליקוי חדש</Btn>
          )}
        </div>
      </div>

      {locFilter && (
        <div className="mb-3 text-xs bg-brand/5 border border-brand/20 rounded-lg px-3 py-2 flex items-center justify-between">
          <span>מסונן לפי מיקום: <b>{locName(locFilter)}</b></span>
          <button className="text-brand font-bold" onClick={() => navigate(href('defects'))}>נקה</button>
        </div>
      )}

      {/* סינון */}
      <div className="space-y-2 mb-4">
        <div className="relative">
          <Search size={15} className="absolute top-2.5 start-3 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי כותרת או #מספר…" className="ps-9" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {(Object.keys(STATUS_LABEL) as DefectStatus[]).map(s => (
            <Chip key={s} active={statuses.includes(s)} onClick={() => setStatuses(cur => cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s])}>
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: STATUS_HEX[s] }} /> {STATUS_LABEL[s]}
            </Chip>
          ))}
          <Chip active={overdueOnly} onClick={() => setOverdueOnly(o => !o)} className={overdueOnly ? '!bg-st-open !border-st-open' : ''}>⚠ באיחור</Chip>
          <Chip active={mineOnly} onClick={() => setMineOnly(o => !o)}>שלי</Chip>
        </div>
        <div className="flex gap-2">
          {can(me, 'defect:view_all') && (
            <Select value={companyId} onChange={e => setCompanyId(e.target.value)} className="max-w-44 text-xs">
              <option value="">כל הקבלנים</option>
              {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
          <Select value={dtype} onChange={e => setDtype(e.target.value)} className="max-w-36 text-xs">
            <option value="">כל הסוגים</option>
            {DEFECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </Select>
        </div>
      </div>

      {rows.list.length === 0 ? (
        <EmptyState icon={<ClipboardList size={44} />} title="אין ליקויים תואמים" hint="נסה לשנות את הסינון, או פתח ליקוי חדש" />
      ) : view === 'list' ? (
        <div className="space-y-2">
          {rows.list.map(d => <DefectRow key={d.id} d={d} thumbId={rows.thumb.get(d.id)} comments={rows.commentCount.get(d.id) ?? 0} />)}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4 items-start">
          {(Object.keys(STATUS_LABEL) as DefectStatus[]).map(s => {
            const col = rows.list.filter(d => d.status === s)
            return (
              <div key={s} className="w-60 shrink-0">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_HEX[s] }} />
                  <span className="text-xs font-bold">{STATUS_LABEL[s]}</span>
                  <span className="text-[10px] text-slate-400 ltr-num">{col.length}</span>
                </div>
                <div className="space-y-2">
                  {col.map(d => (
                    <Link key={d.id} to={href(`defects/${d.id}`)}>
                      <Card className="p-2.5 hover:shadow-md transition-shadow">
                        <div className="text-[10px] text-slate-400 ltr-num">#{d.number}</div>
                        <div className="text-xs font-bold leading-snug">{d.title}</div>
                        <div className="text-[10px] text-slate-400 mt-1 truncate">{locName(d.location_id)}</div>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DefectRow({ d, thumbId, comments }: { d: Defect; thumbId?: string; comments: number }) {
  const { href, companyMap, locName } = useProject()
  const overdue = isOverdue(d)
  const dLeft = daysUntil(d.due_date)
  return (
    <Link to={href(`defects/${d.id}`)}>
      <Card className="p-3 flex items-center gap-3 hover:shadow-md transition-shadow">
        <BlobImg blobId={thumbId} className="w-14 h-14 rounded-lg shrink-0 hidden sm:block" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-400 font-bold ltr-num">#{d.number}</span>
            <span className="font-bold text-sm truncate">{d.title}</span>
            <span className={cx('w-2 h-2 rounded-full shrink-0', SEVERITY_DOT[d.severity])} title={`חומרה: ${SEVERITY_LABEL[d.severity]}`} />
          </div>
          <div className="text-xs text-slate-400 truncate mt-0.5">
            {locName(d.location_id)}
            {d.assigned_company_id && <> · {companyMap.get(d.assigned_company_id)?.name}</>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge className={STATUS_BADGE[d.status]}>{STATUS_LABEL[d.status]}</Badge>
          <div className="flex items-center gap-2 text-[11px]">
            {comments > 0 && <span className="flex items-center gap-0.5 text-slate-400"><MessageSquare size={11} /> {comments}</span>}
            {d.due_date && (
              <span className={cx('font-medium', overdue ? 'text-st-open font-bold' : 'text-slate-400')}>
                {overdue ? `איחור ${Math.abs(dLeft ?? 0)} ימים` : fmtDate(d.due_date)}
              </span>
            )}
          </div>
        </div>
      </Card>
    </Link>
  )
}
