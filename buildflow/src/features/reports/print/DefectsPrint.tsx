import { useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../data/db'
import { PrintShell, StatusText, usePrintData } from './PrintCommon'
import { BlobImg } from '../../../components/BlobImg'
import { Spinner } from '../../../components/ui'
import { SEVERITY_LABEL, STATUS_LABEL } from '../../../lib/labels'
import { visibleToUser } from '../../../lib/permissions'
import { isOverdue, OPEN_STATUSES } from '../../../lib/status'
import { fmtDate } from '../../../lib/date'
import { cx } from '../../../lib/util'
import type { Defect, DefectStatus } from '../../../data/types'

export function DefectsPrint() {
  const { projectId = '' } = useParams()
  const [params] = useSearchParams()
  const onlyOpen = params.get('st') !== 'all'
  const by = params.get('by') === 'contractor' ? 'contractor' : 'location'

  const base = usePrintData(projectId)
  const raw = useLiveQuery(async () => ({
    defects: await db.defects.where('project_id').equals(projectId).and(d => !d.archived_at).toArray(),
    attachments: await db.attachments.where('project_id').equals(projectId).toArray(),
  }), [projectId])

  const calc = useMemo(() => {
    if (!base || !raw) return null
    let defects = visibleToUser(base.me, raw.defects)
    if (onlyOpen) defects = defects.filter(d => OPEN_STATUSES.includes(d.status))
    defects.sort((a, b) => a.number - b.number)

    const thumb = new Map<string, string>()
    for (const a of raw.attachments) {
      if (a.entity_type === 'defect' && !thumb.has(a.entity_id)) thumb.set(a.entity_id, a.thumb_blob_id ?? a.blob_id)
    }

    const groupKey = (d: Defect): string => {
      if (by === 'contractor') return d.assigned_company_id ? base.companyMap.get(d.assigned_company_id)?.name ?? 'ללא קבלן' : 'ללא קבלן'
      let cur = base.locMap.get(d.location_id)
      while (cur && cur.type !== 'floor' && cur.parent_id) cur = base.locMap.get(cur.parent_id)
      return cur?.name ?? '—'
    }
    const groups = new Map<string, Defect[]>()
    for (const d of defects) {
      const k = groupKey(d)
      const arr = groups.get(k) ?? []
      arr.push(d)
      groups.set(k, arr)
    }

    const counts = (['open', 'in_progress', 'ready_for_review', 'rejected', 'closed', 'cancelled'] as DefectStatus[])
      .map(s => ({ s, n: defects.filter(d => d.status === s).length })).filter(x => x.n > 0)
    const overdue = defects.filter(isOverdue).length

    return { defects, groups: [...groups.entries()], thumb, counts, overdue }
  }, [base, raw, onlyOpen, by])

  if (base === null) return <div className="p-6">נדרשת כניסה למערכת.</div>
  if (!base || !calc) return <Spinner />

  return (
    <PrintShell project={base.project} me={base.me}
      title={onlyOpen ? 'דוח ליקויים פתוחים' : 'דוח ליקויים — מלא'}
      subtitle={`קיבוץ לפי ${by === 'contractor' ? 'קבלן' : 'קומה'} · ${calc.defects.length} פריטים${calc.overdue ? ` · ${calc.overdue} באיחור` : ''}`}>

      {/* סיכום */}
      <div className="flex gap-4 flex-wrap text-xs mb-5 bg-slate-50 rounded-lg p-3 [break-inside:avoid]">
        {calc.counts.map(({ s, n }) => (
          <span key={s}><StatusText s={s} /> <b className="ltr-num">{n}</b></span>
        ))}
        {calc.overdue > 0 && <span className="text-st-open font-extrabold">⚠ באיחור {calc.overdue}</span>}
      </div>

      {calc.groups.map(([group, list]) => (
        <section key={group} className="mb-6">
          <h2 className="text-base font-extrabold bg-navy text-white rounded px-3 py-1.5 mb-2 [break-inside:avoid]">
            {group} <span className="font-normal opacity-70 text-sm">({list.length})</span>
          </h2>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-slate-500 border-b-2 border-slate-300 text-start">
                <th className="text-start py-1.5 w-8">#</th>
                <th className="text-start py-1.5 w-14">תמונה</th>
                <th className="text-start py-1.5">ליקוי</th>
                <th className="text-start py-1.5">מיקום</th>
                <th className="text-start py-1.5">{by === 'contractor' ? 'סוג' : 'קבלן'}</th>
                <th className="text-start py-1.5 w-16">חומרה</th>
                <th className="text-start py-1.5 w-20">יעד</th>
                <th className="text-start py-1.5 w-24">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {list.map(d => (
                <tr key={d.id} className="border-b border-slate-200 align-top [break-inside:avoid]">
                  <td className="py-1.5 font-bold ltr-num">{d.number}</td>
                  <td className="py-1.5 pe-2">
                    {calc.thumb.has(d.id) && <BlobImg blobId={calc.thumb.get(d.id)} className="w-12 h-12 rounded" />}
                  </td>
                  <td className="py-1.5 pe-2">
                    <div className="font-bold">{d.title}</div>
                    {d.description && <div className="text-slate-500 text-[10px]">{d.description}</div>}
                  </td>
                  <td className="py-1.5 pe-2 text-slate-600">{base.locName(d.location_id)}</td>
                  <td className="py-1.5 pe-2 text-slate-600">
                    {by === 'contractor' ? (d.dtype ?? '—') : d.assigned_company_id ? base.companyMap.get(d.assigned_company_id)?.name : '—'}
                  </td>
                  <td className="py-1.5">{SEVERITY_LABEL[d.severity]}</td>
                  <td className={cx('py-1.5 ltr-num', isOverdue(d) && 'text-st-open font-extrabold')}>{fmtDate(d.due_date)}</td>
                  <td className="py-1.5"><StatusText s={d.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {calc.defects.length === 0 && (
        <div className="text-center text-slate-400 py-10">אין ליקויים {onlyOpen ? 'פתוחים' : ''} — {STATUS_LABEL.closed} 🎉</div>
      )}
    </PrintShell>
  )
}
