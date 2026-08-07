import { useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../data/db'
import { PrintShell, usePrintData } from './PrintCommon'
import { Spinner } from '../../../components/ui'
import { WEATHER_LABEL } from '../../../lib/labels'
import { fmtDate, fmtDateTime } from '../../../lib/date'

export function LogPrint() {
  const { projectId = '', logId = '' } = useParams()
  const base = usePrintData(projectId)
  const log = useLiveQuery(() => db.daily_logs.get(logId), [logId])

  if (base === null) return <div className="p-6">נדרשת כניסה למערכת.</div>
  if (!base || log === undefined) return <Spinner />
  if (!log) return <div className="p-6">היומן לא נמצא.</div>

  const totalWorkers = log.manpower.reduce((s, m) => s + m.count, 0)

  const section = (title: string, body?: string) =>
    body ? (
      <div className="mb-3 [break-inside:avoid]">
        <h3 className="font-bold text-xs text-slate-500 mb-0.5">{title}</h3>
        <p className="text-sm bg-slate-50 rounded p-2.5 whitespace-pre-wrap">{body}</p>
      </div>
    ) : null

  return (
    <PrintShell project={base.project} me={base.me}
      title={`יומן עבודה — ${fmtDate(log.date)}`}
      subtitle={log.status === 'locked' ? `אושר וננעל ע"י ${log.locked_by ? base.userMap.get(log.locked_by)?.full_name : ''} · ${fmtDateTime(log.locked_at)}` : log.status === 'submitted' ? 'הוגש לאישור' : 'טיוטה'}>

      <div className="grid grid-cols-4 gap-3 text-sm mb-5 [break-inside:avoid]">
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <div className="text-[10px] text-slate-400">מזג אוויר</div>
          <div className="font-bold">{log.weather ? WEATHER_LABEL[log.weather] : '—'}</div>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <div className="text-[10px] text-slate-400">טמפרטורה</div>
          <div className="font-bold ltr-num">{log.temp_c != null ? `${log.temp_c}°C` : '—'}</div>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <div className="text-[10px] text-slate-400">שעות עבודה</div>
          <div className="font-bold ltr-num">{log.hours_from || '—'}–{log.hours_to || '—'}</div>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <div className="text-[10px] text-slate-400">סה"כ עובדים</div>
          <div className="font-bold ltr-num">{totalWorkers}</div>
        </div>
      </div>

      {log.manpower.length > 0 && (
        <section className="mb-4 [break-inside:avoid]">
          <h2 className="font-extrabold text-sm border-b-2 border-navy pb-1 mb-2">כוח אדם</h2>
          <table className="w-full text-xs">
            <thead><tr className="text-slate-500 border-b border-slate-300">
              <th className="text-start py-1">חברה</th><th className="text-start py-1">מקצוע</th><th className="text-start py-1 w-16">כמות</th>
            </tr></thead>
            <tbody>
              {log.manpower.map((m, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-1 font-medium">{base.companyMap.get(m.company_id)?.name ?? '—'}</td>
                  <td className="py-1">{m.trade}</td>
                  <td className="py-1 ltr-num">{m.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {log.equipment.length > 0 && (
        <div className="mb-3 text-sm [break-inside:avoid]">
          <h3 className="font-bold text-xs text-slate-500 mb-0.5">ציוד באתר</h3>
          {log.equipment.join(' · ')}
        </div>
      )}

      {section('עבודות שבוצעו', log.work_performed)}
      {section('משלוחים וחומרים', log.deliveries)}
      {section('עיכובים', log.delays)}
      {log.safety_events && (
        <div className="mb-3 [break-inside:avoid]">
          <h3 className="font-bold text-xs text-st-open mb-0.5">⚠ אירועי בטיחות</h3>
          <p className="text-sm bg-red-50 border border-red-200 rounded p-2.5">{log.safety_events}</p>
        </div>
      )}
      {section('מבקרים', log.visitors)}
      {section('הערות', log.notes)}

      <div className="mt-8 grid grid-cols-2 gap-8 text-xs [break-inside:avoid]">
        <div className="border-t border-slate-400 pt-1">
          חתימת מנהל העבודה: {base.userMap.get(log.created_by)?.full_name}
        </div>
        <div className="border-t border-slate-400 pt-1">
          אישור מנהל הפרויקט: {log.locked_by ? base.userMap.get(log.locked_by)?.full_name : '________________'}
        </div>
      </div>
    </PrintShell>
  )
}
