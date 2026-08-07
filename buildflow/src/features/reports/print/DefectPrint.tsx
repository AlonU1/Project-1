import { useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../data/db'
import { PrintShell, StatusText, usePrintData } from './PrintCommon'
import { AnnotatedImg } from '../../photos/Annotate'
import { Spinner } from '../../../components/ui'
import { SEVERITY_LABEL, STATUS_LABEL } from '../../../lib/labels'
import { isOverdue } from '../../../lib/status'
import { fmtDate, fmtDateTime } from '../../../lib/date'
import { cx } from '../../../lib/util'
import type { DefectStatus } from '../../../data/types'

export function DefectPrint() {
  const { projectId = '', defectId = '' } = useParams()
  const base = usePrintData(projectId)

  const data = useLiveQuery(async () => {
    const defect = await db.defects.get(defectId)
    const [attachments, comments, activity] = await Promise.all([
      db.attachments.where('[entity_type+entity_id]').equals(['defect', defectId]).toArray(),
      db.comments.where('[entity_type+entity_id]').equals(['defect', defectId]).toArray(),
      db.activity.where('[entity_type+entity_id]').equals(['defect', defectId]).toArray(),
    ])
    return { defect, attachments, comments, activity: activity.sort((a, b) => a.at.localeCompare(b.at)) }
  }, [defectId])

  if (base === null) return <div className="p-6">נדרשת כניסה למערכת.</div>
  if (!base || !data) return <Spinner />
  const d = data.defect
  if (!d) return <div className="p-6">הליקוי לא נמצא.</div>

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex gap-2 py-1 border-b border-slate-100">
      <span className="w-28 shrink-0 text-slate-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )

  return (
    <PrintShell project={base.project} me={base.me}
      title={`ליקוי #${d.number} — ${d.title}`}
      subtitle={base.locName(d.location_id)}>

      <div className="flex items-center gap-3 mb-4 [break-inside:avoid]">
        <StatusText s={d.status} />
        <span className="text-sm">חומרה: <b>{SEVERITY_LABEL[d.severity]}</b></span>
        {isOverdue(d) && <span className="text-st-open font-extrabold text-sm">⚠ באיחור</span>}
      </div>

      <div className="grid grid-cols-2 gap-x-8 text-sm mb-5 [break-inside:avoid]">
        {row('סוג', d.dtype ?? '—')}
        {row('קבלן אחראי', d.assigned_company_id ? base.companyMap.get(d.assigned_company_id)?.name ?? '—' : '—')}
        {row('אחראי', d.assigned_user_id ? base.userMap.get(d.assigned_user_id)?.full_name ?? '—' : 'כל החברה')}
        {row('מועד יעד', <span className={cx('ltr-num', isOverdue(d) && 'text-st-open font-bold')}>{fmtDate(d.due_date)}</span>)}
        {row('נפתח', <>{fmtDate(d.created_at)} · {base.userMap.get(d.created_by)?.full_name}</>)}
        {row('נסגר', d.closed_at ? <>{fmtDate(d.closed_at)} · {d.closed_by ? base.userMap.get(d.closed_by)?.full_name : ''}</> : '—')}
      </div>

      {d.description && (
        <p className="text-sm bg-slate-50 rounded-lg p-3 mb-5 [break-inside:avoid]">{d.description}</p>
      )}

      {data.attachments.length > 0 && (
        <section className="mb-5">
          <h2 className="font-extrabold text-sm border-b-2 border-navy pb-1 mb-3">תמונות ({data.attachments.length})</h2>
          <div className="grid grid-cols-2 gap-3">
            {data.attachments.map(a => (
              <figure key={a.id} className="[break-inside:avoid]">
                <AnnotatedImg att={a} maxH="60mm" className="border border-slate-200 rounded-lg overflow-hidden" />
                <figcaption className="text-[10px] text-slate-500 mt-1">
                  {a.phase === 'after' ? 'אחרי תיקון' : a.phase === 'before' ? 'לפני תיקון' : 'כללי'} · <span className="ltr-num">{fmtDateTime(a.taken_at ?? a.created_at)}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {data.comments.length > 0 && (
        <section className="mb-5 [break-inside:avoid]">
          <h2 className="font-extrabold text-sm border-b-2 border-navy pb-1 mb-2">שיחה</h2>
          {data.comments.map(c => (
            <div key={c.id} className="text-xs py-1.5 border-b border-slate-100">
              <b>{base.userMap.get(c.created_by)?.full_name}</b>
              <span className="text-slate-400 ltr-num"> · {fmtDateTime(c.created_at)}</span>
              <div className="mt-0.5">{c.body}</div>
            </div>
          ))}
        </section>
      )}

      <section className="[break-inside:avoid]">
        <h2 className="font-extrabold text-sm border-b-2 border-navy pb-1 mb-2">היסטוריה</h2>
        {data.activity.map(a => {
          const label =
            a.action === 'created' ? 'הפריט נפתח' :
            a.action === 'status_changed' ? `סטטוס: ${STATUS_LABEL[a.old_value as DefectStatus] ?? ''} ← ${STATUS_LABEL[a.new_value as DefectStatus] ?? ''}` :
            a.action === 'assigned' ? `הוקצה: ${base.companyMap.get(a.new_value ?? '')?.name ?? ''}` :
            a.action === 'commented' ? 'נוספה תגובה' :
            a.action === 'attachment_added' ? `נוספו ${a.new_value} תמונות` : a.action
          return (
            <div key={a.id} className="text-xs py-1 border-b border-slate-100 flex justify-between">
              <span><b>{base.userMap.get(a.created_by)?.full_name ?? 'מערכת'}</b> — {label}</span>
              <span className="text-slate-400 ltr-num">{fmtDateTime(a.at)}</span>
            </div>
          )
        })}
      </section>
    </PrintShell>
  )
}
