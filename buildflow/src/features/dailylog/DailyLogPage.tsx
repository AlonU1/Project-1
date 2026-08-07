import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarDays, FileText, Lock, Plus, Send } from 'lucide-react'
import { db } from '../../data/db'
import { dl } from '../../data/layer'
import { useProject } from '../shell/ProjectContext'
import { Badge, Btn, Card, Input, Label, Spinner, TextArea } from '../../components/ui'
import { WEATHER_LABEL } from '../../lib/labels'
import { can } from '../../lib/permissions'
import { fmtDate, todayISO } from '../../lib/date'
import { cx } from '../../lib/util'
import type { DailyLog, ManpowerRow } from '../../data/types'

export function DailyLogPage() {
  const { project, me, companyMap, contractors } = useProject()
  const [openId, setOpenId] = useState<string | null>(null)

  const logs = useLiveQuery(
    () => db.daily_logs.where('project_id').equals(project.id).and(l => !l.archived_at).toArray(),
    [project.id],
  )

  if (!logs) return <Spinner />
  const sorted = [...logs].sort((a, b) => b.date.localeCompare(a.date))
  const todayLog = logs.find(l => l.date === todayISO())
  const open = openId ? logs.find(l => l.id === openId) : undefined

  async function createToday() {
    const log = await dl.create<DailyLog>('daily_logs', {
      project_id: project.id, date: todayISO(), manpower: [], equipment: [], status: 'draft',
      locked_at: null, locked_by: null,
    }, me)
    setOpenId(log.id)
  }

  const statusBadge = (s: DailyLog['status']) =>
    s === 'locked' ? <Badge className="bg-st-closed/10 text-st-closed border-st-closed/30"><Lock size={11} /> נעול</Badge>
    : s === 'submitted' ? <Badge className="bg-st-review/10 text-st-review border-st-review/30">הוגש</Badge>
    : <Badge className="bg-amber-50 dark:bg-amber-900/30 text-amber-600 border-amber-200 dark:border-amber-800">טיוטה</Badge>

  if (open) {
    return <LogEditor log={open} onBack={() => setOpenId(null)} />
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-extrabold">יומן עבודה</h1>
        {can(me, 'log:fill') && !todayLog && (
          <Btn variant="primary" onClick={createToday}><Plus size={15} /> פתח יומן להיום</Btn>
        )}
      </div>

      <div className="space-y-2">
        {sorted.map(l => (
          <Card key={l.id} onClick={() => setOpenId(l.id)} className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0"><CalendarDays size={20} /></div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm ltr-num">{fmtDate(l.date)}</div>
              <div className="text-xs text-slate-400 truncate">
                {l.weather ? WEATHER_LABEL[l.weather] : ''}
                {l.manpower.length > 0 && ` · ${l.manpower.reduce((s, m) => s + m.count, 0)} עובדים`}
                {l.work_performed && ` · ${l.work_performed.slice(0, 60)}`}
              </div>
            </div>
            {statusBadge(l.status)}
          </Card>
        ))}
        {sorted.length === 0 && <Card className="p-8 text-center text-slate-400 text-sm">אין יומנים עדיין</Card>}
      </div>
      <span className="hidden">{contractors.length}{companyMap.size}</span>
    </div>
  )
}

function LogEditor({ log, onBack }: { log: DailyLog; onBack: () => void }) {
  const { me, companyMap, contractors, href } = useProject()
  const navigate = useNavigate()
  const locked = log.status === 'locked'
  const editable = !locked && can(me, 'log:fill')

  const patch = (p: Partial<DailyLog>) => dl.update<DailyLog>('daily_logs', log.id, p, me)

  const setMp = (i: number, p: Partial<ManpowerRow>) => {
    const mp = log.manpower.map((r, j) => (j === i ? { ...r, ...p } : r))
    patch({ manpower: mp })
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-brand font-medium">← חזרה לרשימה</button>
        <div className="flex gap-2">
          <Btn size="sm" onClick={() => navigate(href(`print/log/${log.id}`))}><FileText size={13} /> PDF</Btn>
          {editable && log.status === 'draft' && (
            <Btn size="sm" variant="primary" onClick={() => patch({ status: 'submitted' })}><Send size={13} /> הגש לאישור</Btn>
          )}
          {log.status === 'submitted' && can(me, 'log:lock') && (
            <Btn size="sm" variant="success" onClick={() => patch({ status: 'locked', locked_at: new Date().toISOString(), locked_by: me.id })}>
              <Lock size={13} /> אשר ונעל
            </Btn>
          )}
        </div>
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-extrabold text-lg ltr-num">{fmtDate(log.date)}</h2>
          {locked && <Badge className="bg-st-closed/10 text-st-closed border-st-closed/30"><Lock size={11} /> נעול — לצפייה בלבד</Badge>}
        </div>

        <div>
          <Label>מזג אוויר</Label>
          <div className="flex gap-1.5 flex-wrap">
            {Object.entries(WEATHER_LABEL).map(([k, v]) => (
              <button key={k} disabled={!editable} onClick={() => patch({ weather: k })}
                className={cx('px-3 py-1.5 rounded-full text-xs border font-medium disabled:opacity-60',
                  log.weather === k ? 'bg-brand text-white border-brand' : 'border-slate-300 dark:border-slate-600')}>
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div><Label>טמפ׳ (°C)</Label><Input type="number" disabled={!editable} value={log.temp_c ?? ''} onChange={e => patch({ temp_c: e.target.value === '' ? null : +e.target.value })} /></div>
          <div><Label>משעה</Label><Input type="time" disabled={!editable} value={log.hours_from ?? ''} onChange={e => patch({ hours_from: e.target.value })} /></div>
          <div><Label>עד שעה</Label><Input type="time" disabled={!editable} value={log.hours_to ?? ''} onChange={e => patch({ hours_to: e.target.value })} /></div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <Label>כוח אדם — <span className="ltr-num">{log.manpower.reduce((s, m) => s + m.count, 0)}</span> עובדים</Label>
            {editable && (
              <Btn size="sm" variant="ghost" onClick={() => patch({ manpower: [...log.manpower, { company_id: contractors[0]?.id ?? '', trade: '', count: 1 }] })}>
                <Plus size={13} /> שורה
              </Btn>
            )}
          </div>
          <div className="space-y-1.5">
            {log.manpower.map((m, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_70px] gap-1.5">
                <select disabled={!editable} value={m.company_id} onChange={e => setMp(i, { company_id: e.target.value })}
                  className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-xs">
                  {[...companyMap.values()].map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <Input disabled={!editable} value={m.trade} placeholder="מקצוע" className="text-xs" onChange={e => setMp(i, { trade: e.target.value })} />
                <Input disabled={!editable} type="number" min={0} value={m.count} className="text-xs ltr-num" onChange={e => setMp(i, { count: +e.target.value || 0 })} />
              </div>
            ))}
          </div>
        </div>

        <div><Label>עבודות שבוצעו</Label><TextArea disabled={!editable} value={log.work_performed ?? ''} onChange={e => patch({ work_performed: e.target.value })} /></div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label>משלוחים וחומרים</Label><TextArea disabled={!editable} value={log.deliveries ?? ''} onChange={e => patch({ deliveries: e.target.value })} className="min-h-14" /></div>
          <div><Label>עיכובים</Label><TextArea disabled={!editable} value={log.delays ?? ''} onChange={e => patch({ delays: e.target.value })} className="min-h-14" /></div>
          <div><Label>אירועי בטיחות</Label><TextArea disabled={!editable} value={log.safety_events ?? ''} onChange={e => patch({ safety_events: e.target.value })} className={cx('min-h-14', log.safety_events && 'border-st-open')} /></div>
          <div><Label>מבקרים</Label><TextArea disabled={!editable} value={log.visitors ?? ''} onChange={e => patch({ visitors: e.target.value })} className="min-h-14" /></div>
        </div>
        <div><Label>הערות</Label><TextArea disabled={!editable} value={log.notes ?? ''} onChange={e => patch({ notes: e.target.value })} className="min-h-14" /></div>
      </Card>
    </div>
  )
}
