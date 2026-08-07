import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ListTodo, Plus } from 'lucide-react'
import { db } from '../../data/db'
import { useProject } from '../shell/ProjectContext'
import { Badge, Btn, Card, Dialog, EmptyState, Input, Label, Select, Spinner, TextArea } from '../../components/ui'
import { LocationPicker } from '../../components/LocationPicker'
import { PRIORITY_LABEL, TASK_STATUS_COLOR, TASK_STATUS_LABEL } from '../../lib/labels'
import { can, visibleToUser } from '../../lib/permissions'
import { fmtDate, isoDaysFromNow } from '../../lib/date'
import { createTask, setTaskProgress, setTaskStatus } from './taskService'
import { cx } from '../../lib/util'
import type { Priority, Task, TaskStatus } from '../../data/types'

const COLUMNS: TaskStatus[] = ['new', 'in_progress', 'blocked', 'review', 'done']

export function TasksPage() {
  const { project, me } = useProject()
  const [newOpen, setNewOpen] = useState(false)
  const [selected, setSelected] = useState<Task | null>(null)

  const tasks = useLiveQuery(
    () => db.tasks.where('project_id').equals(project.id).and(t => !t.archived_at).toArray(),
    [project.id],
  )

  if (!tasks) return <Spinner />
  const visible = visibleToUser(me, tasks)

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-extrabold">משימות <span className="text-sm font-normal text-slate-400 ltr-num">{visible.length}</span></h1>
        {can(me, 'task:create') && <Btn variant="primary" onClick={() => setNewOpen(true)}><Plus size={15} /> משימה חדשה</Btn>}
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={<ListTodo size={44} />} title="אין משימות" />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4 items-start">
          {COLUMNS.map(s => {
            const col = visible.filter(t => t.status === s).sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9'))
            return (
              <div key={s} className="w-64 shrink-0">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className={cx('w-2.5 h-2.5 rounded-full', TASK_STATUS_COLOR[s])} />
                  <span className="text-xs font-bold">{TASK_STATUS_LABEL[s]}</span>
                  <span className="text-[10px] text-slate-400 ltr-num">{col.length}</span>
                </div>
                <div className="space-y-2">
                  {col.map(t => <TaskCard key={t.id} t={t} onClick={() => setSelected(t)} />)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <NewTaskDialog open={newOpen} onClose={() => setNewOpen(false)} />
      {selected && <TaskDialog task={tasks.find(x => x.id === selected.id) ?? selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function TaskCard({ t, onClick }: { t: Task; onClick: () => void }) {
  const { companyMap, locName } = useProject()
  return (
    <Card onClick={onClick} className="p-3">
      <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
        <span className="ltr-num">#{t.number}</span>
        {t.priority === 'high' && <Badge className="bg-st-open/10 text-st-open border-st-open/30">דחוף</Badge>}
      </div>
      <div className="text-sm font-bold leading-snug mt-0.5">{t.title}</div>
      {t.location_id && <div className="text-[10px] text-slate-400 mt-1 truncate">{locName(t.location_id)}</div>}
      <div className="flex items-center justify-between mt-2 text-[11px] text-slate-500">
        <span>{t.assigned_company_id ? companyMap.get(t.assigned_company_id)?.name : 'פנימי'}</span>
        {t.due_date && <span className="ltr-num">{fmtDate(t.due_date)}</span>}
      </div>
      {t.status === 'in_progress' && (
        <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full mt-2 overflow-hidden">
          <div className="h-full bg-st-progress rounded-full" style={{ width: `${t.progress_pct}%` }} />
        </div>
      )}
      {t.status === 'blocked' && t.blocked_reason && (
        <div className="text-[10px] text-st-rejected mt-1.5 font-medium">⛔ {t.blocked_reason}</div>
      )}
    </Card>
  )
}

function TaskDialog({ task, onClose }: { task: Task; onClose: () => void }) {
  const { me, companyMap, locName } = useProject()
  const [blockReason, setBlockReason] = useState('')
  const canAct = me.role !== 'contractor' || task.assigned_company_id === me.company_id

  return (
    <Dialog open onClose={onClose} title={`משימה #${task.number}`}>
      <div className="space-y-4">
        <div>
          <div className="font-bold text-lg">{task.title}</div>
          {task.description && <p className="text-sm text-slate-500 mt-1">{task.description}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><div className="text-[11px] text-slate-400">סטטוס</div><Badge className={cx('text-white border-transparent', TASK_STATUS_COLOR[task.status])}>{TASK_STATUS_LABEL[task.status]}</Badge></div>
          <div><div className="text-[11px] text-slate-400">עדיפות</div>{PRIORITY_LABEL[task.priority]}</div>
          <div><div className="text-[11px] text-slate-400">אחראי</div>{task.assigned_company_id ? companyMap.get(task.assigned_company_id)?.name : 'פנימי'}</div>
          <div><div className="text-[11px] text-slate-400">מועד יעד</div>{fmtDate(task.due_date)}</div>
          {task.location_id && <div className="col-span-2"><div className="text-[11px] text-slate-400">מיקום</div>{locName(task.location_id)}</div>}
        </div>

        {canAct && (
          <>
            {task.status === 'in_progress' && (
              <div>
                <Label>התקדמות — <span className="ltr-num">{task.progress_pct}%</span></Label>
                <input type="range" min={0} max={100} step={5} value={task.progress_pct} className="w-full accent-brand"
                  onChange={e => setTaskProgress(task, +e.target.value, me)} />
              </div>
            )}
            <div className="flex gap-2 flex-wrap pt-2 border-t border-slate-100 dark:border-slate-800">
              {task.status === 'new' && <Btn size="sm" variant="primary" onClick={() => setTaskStatus(task, 'in_progress', me)}>התחל ביצוע</Btn>}
              {task.status === 'in_progress' && <Btn size="sm" variant="primary" onClick={() => setTaskStatus(task, 'review', me)}>סיימתי — לבדיקה</Btn>}
              {task.status === 'review' && can(me, 'task:create') && <Btn size="sm" variant="success" onClick={() => setTaskStatus(task, 'done', me)}>אשר וסגור</Btn>}
              {task.status === 'review' && can(me, 'task:create') && <Btn size="sm" variant="danger" onClick={() => setTaskStatus(task, 'in_progress', me)}>החזר לביצוע</Btn>}
              {task.status === 'blocked' && <Btn size="sm" variant="primary" onClick={() => setTaskStatus(task, 'in_progress', me)}>החסימה הוסרה</Btn>}
              {(task.status === 'new' || task.status === 'in_progress') && (
                <div className="flex gap-1.5 items-center w-full mt-1">
                  <Input value={blockReason} onChange={e => setBlockReason(e.target.value)} placeholder="סיבת חסימה…" className="text-xs" />
                  <Btn size="sm" variant="neutral" disabled={!blockReason.trim()} onClick={() => setTaskStatus(task, 'blocked', me, blockReason.trim())}>חסום</Btn>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}

function NewTaskDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { project, me, contractors, locations } = useProject()
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [priority, setPriority] = useState<Priority>('normal')
  const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!title.trim() || busy) return
    setBusy(true)
    try {
      await createTask({
        project_id: project.id, title: title.trim(), description: desc || undefined,
        location_id: locationId || null, priority,
        assigned_company_id: companyId || null, due_date: due || null,
      }, me)
      onClose(); setTitle(''); setDesc(''); setCompanyId(''); setLocationId(''); setDue('')
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} title="משימה חדשה">
      <div className="space-y-4">
        <div><Label required>כותרת</Label><Input value={title} onChange={e => setTitle(e.target.value)} autoFocus /></div>
        <div><Label>תיאור</Label><TextArea value={desc} onChange={e => setDesc(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>קבלן</Label>
            <Select value={companyId} onChange={e => setCompanyId(e.target.value)}>
              <option value="">פנימי</option>
              {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div><Label>עדיפות</Label>
            <Select value={priority} onChange={e => setPriority(e.target.value as Priority)}>
              {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </div>
        </div>
        <div><Label>מועד יעד</Label>
          <div className="flex gap-1.5 mb-2">
            {[['היום', 0], ['מחר', 1], ['בעוד שבוע', 7]].map(([l, days]) => (
              <button key={l as string} onClick={() => setDue(isoDaysFromNow(days as number))}
                className={cx('px-3 py-1 rounded-full text-xs border', due === isoDaysFromNow(days as number) ? 'bg-brand text-white border-brand' : 'border-slate-300 dark:border-slate-600')}>
                {l}
              </button>
            ))}
          </div>
          <Input type="date" value={due} onChange={e => setDue(e.target.value)} />
        </div>
        <div><Label>מיקום (אופציונלי)</Label><LocationPicker locations={locations} value={locationId} onChange={setLocationId} /></div>
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>ביטול</Btn>
          <Btn variant="primary" disabled={!title.trim() || busy} onClick={save}>צור משימה</Btn>
        </div>
      </div>
    </Dialog>
  )
}
