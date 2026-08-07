import { useLiveQuery } from 'dexie-react-hooks'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { db } from '../../data/db'
import { useProject } from '../shell/ProjectContext'
import { Btn, Card } from '../../components/ui'
import { SEVERITY_LABEL, STATUS_LABEL, TASK_STATUS_LABEL } from '../../lib/labels'
import { can } from '../../lib/permissions'
import { exportCsv } from '../../lib/csv'
import { todayISO } from '../../lib/date'

export function ReportsPage() {
  const { project, me, companyMap, userMap, locName } = useProject()
  const canExport = can(me, 'report:export')

  const data = useLiveQuery(async () => ({
    defects: await db.defects.where('project_id').equals(project.id).and(d => !d.archived_at).toArray(),
    tasks: await db.tasks.where('project_id').equals(project.id).and(t => !t.archived_at).toArray(),
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

  const items = [
    { icon: <FileSpreadsheet size={22} />, title: 'ייצוא ליקויים (CSV)', desc: 'כל הליקויים בפרויקט — נפתח באקסל', action: exportDefects, ready: true },
    { icon: <FileSpreadsheet size={22} />, title: 'ייצוא משימות (CSV)', desc: 'כל המשימות בפרויקט', action: exportTasks, ready: true },
    { icon: <FileText size={22} />, title: 'דוח ליקויים PDF', desc: 'דוח מעוצב עם תמונות, לפי מיקום או קבלן', ready: false },
    { icon: <FileText size={22} />, title: 'דוח יומן עבודה PDF', desc: 'יום בודד או טווח תאריכים', ready: false },
    { icon: <FileText size={22} />, title: 'דוח התקדמות להנהלה', desc: 'KPI, גרפים וחריגות', ready: false },
  ]

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <h1 className="text-lg font-extrabold mb-4">דוחות</h1>
      <div className="space-y-3">
        {items.map((it, i) => (
          <Card key={i} className="p-4 flex items-center gap-4">
            <div className="w-11 h-11 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0">{it.icon}</div>
            <div className="flex-1">
              <div className="font-bold text-sm">{it.title}</div>
              <div className="text-xs text-slate-400">{it.desc}</div>
            </div>
            {it.ready
              ? <Btn size="sm" variant="primary" disabled={!canExport} onClick={it.action}>ייצא</Btn>
              : <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2.5 py-1">שלב 10</span>}
          </Card>
        ))}
      </div>
      {!canExport && <p className="text-xs text-slate-400 mt-3">ייצוא דוחות זמין למנהלים ולמפקחים בלבד.</p>}
    </div>
  )
}
