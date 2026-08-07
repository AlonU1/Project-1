import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { FileSpreadsheet, FileText, Printer } from 'lucide-react'
import { db } from '../../data/db'
import { useProject } from '../shell/ProjectContext'
import { Btn, Card, Select } from '../../components/ui'
import { SEVERITY_LABEL, STATUS_LABEL, TASK_STATUS_LABEL } from '../../lib/labels'
import { can } from '../../lib/permissions'
import { exportCsv } from '../../lib/csv'
import { fmtDate, todayISO } from '../../lib/date'

export function ReportsPage() {
  const { project, me, href, companyMap, userMap, locName } = useProject()
  const navigate = useNavigate()
  const canExport = can(me, 'report:export')

  const [st, setSt] = useState<'open' | 'all'>('open')
  const [by, setBy] = useState<'location' | 'contractor'>('location')
  const [logId, setLogId] = useState('')

  const data = useLiveQuery(async () => ({
    defects: await db.defects.where('project_id').equals(project.id).and(d => !d.archived_at).toArray(),
    tasks: await db.tasks.where('project_id').equals(project.id).and(t => !t.archived_at).toArray(),
    logs: (await db.daily_logs.where('project_id').equals(project.id).toArray()).sort((a, b) => b.date.localeCompare(a.date)),
  }), [project.id])

  function exportDefects() {
    if (!data) return
    exportCsv(`defects-${project.code}-${todayISO()}.csv`,
      ['#', 'כותרת', 'מיקום', 'סוג', 'חומרה', 'סטטוס', 'קבלן', 'אחראי', 'מועד יעד', 'נפתח', 'נסגר', 'תיאור'],
      [...data.defects].sort((a, b) => a.number - b.number).map(d => [
        d.number, d.title, locName(d.location_id), d.dtype ?? '', SEVERITY_LABEL[d.severity], STATUS_LABEL[d.status],
        d.assigned_company_id ? companyMap.get(d.assigned_company_id)?.name ?? '' : '',
        d.assigned_user_id ? userMap.get(d.assigned_user_id)?.full_name ?? '' : '',
        d.due_date ?? '', d.created_at.slice(0, 10), d.closed_at?.slice(0, 10) ?? '', d.description ?? '',
      ]))
  }

  function exportTasks() {
    if (!data) return
    exportCsv(`tasks-${project.code}-${todayISO()}.csv`,
      ['#', 'כותרת', 'מיקום', 'סטטוס', 'עדיפות', 'קבלן', 'מועד יעד', 'התקדמות %'],
      [...data.tasks].sort((a, b) => a.number - b.number).map(t => [
        t.number, t.title, t.location_id ? locName(t.location_id) : '', TASK_STATUS_LABEL[t.status], t.priority,
        t.assigned_company_id ? companyMap.get(t.assigned_company_id)?.name ?? '' : '', t.due_date ?? '', t.progress_pct,
      ]))
  }

  const selectedLog = logId || data?.logs[0]?.id || ''

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <h1 className="text-lg font-extrabold mb-4">דוחות</h1>
      <div className="space-y-3">

        {/* דוח ליקויים מעוצב */}
        <Card className="p-4">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0"><Printer size={22} /></div>
            <div className="flex-1">
              <div className="font-bold text-sm">דוח ליקויים מעוצב (PDF)</div>
              <div className="text-xs text-slate-400">טבלה עם תמונות, מקובצת — להדפסה או שמירה כ-PDF</div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3 ps-15">
            <Select value={st} onChange={e => setSt(e.target.value as 'open' | 'all')} className="max-w-36 text-xs">
              <option value="open">פתוחים בלבד</option>
              <option value="all">כל הליקויים</option>
            </Select>
            <Select value={by} onChange={e => setBy(e.target.value as 'location' | 'contractor')} className="max-w-36 text-xs">
              <option value="location">קיבוץ לפי קומה</option>
              <option value="contractor">קיבוץ לפי קבלן</option>
            </Select>
            <Btn size="sm" variant="primary" disabled={!canExport}
              onClick={() => navigate(href(`print/defects?st=${st}&by=${by}`))}>הפק דוח</Btn>
          </div>
        </Card>

        {/* יומן עבודה מעוצב */}
        <Card className="p-4">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0"><Printer size={22} /></div>
            <div className="flex-1">
              <div className="font-bold text-sm">דוח יומן עבודה (PDF)</div>
              <div className="text-xs text-slate-400">יום בודד, כולל כוח אדם וחתימות</div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3 ps-15">
            <Select value={selectedLog} onChange={e => setLogId(e.target.value)} className="max-w-44 text-xs">
              {(data?.logs ?? []).map(l => <option key={l.id} value={l.id}>{fmtDate(l.date)} {l.status === 'locked' ? '🔒' : ''}</option>)}
            </Select>
            <Btn size="sm" variant="primary" disabled={!canExport || !selectedLog}
              onClick={() => navigate(href(`print/log/${selectedLog}`))}>הפק דוח</Btn>
          </div>
        </Card>

        {/* דוח ליקוי בודד */}
        <Card className="p-4 flex items-center gap-4">
          <div className="w-11 h-11 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0"><FileText size={22} /></div>
          <div className="flex-1">
            <div className="font-bold text-sm">דוח ליקוי בודד (PDF)</div>
            <div className="text-xs text-slate-400">זמין מכל כרטיס ליקוי — כפתור "PDF" בראש הכרטיס</div>
          </div>
          <Btn size="sm" onClick={() => navigate(href('defects'))}>לרשימת הליקויים</Btn>
        </Card>

        {/* CSV */}
        <Card className="p-4 flex items-center gap-4">
          <div className="w-11 h-11 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0"><FileSpreadsheet size={22} /></div>
          <div className="flex-1">
            <div className="font-bold text-sm">ייצוא לאקסל (CSV)</div>
            <div className="text-xs text-slate-400">נתונים גולמיים לעיבוד — ליקויים או משימות</div>
          </div>
          <div className="flex gap-2">
            <Btn size="sm" disabled={!canExport} onClick={exportDefects}>ליקויים</Btn>
            <Btn size="sm" disabled={!canExport} onClick={exportTasks}>משימות</Btn>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-4 opacity-70">
          <div className="w-11 h-11 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center shrink-0"><FileText size={22} /></div>
          <div className="flex-1">
            <div className="font-bold text-sm">דוח התקדמות להנהלה</div>
            <div className="text-xs text-slate-400">KPI, גרפים ומגמות</div>
          </div>
          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2.5 py-1">בקרוב</span>
        </Card>
      </div>
      {!canExport && <p className="text-xs text-slate-400 mt-3">הפקת דוחות זמינה למנהלים ולמפקחים בלבד.</p>}
    </div>
  )
}
