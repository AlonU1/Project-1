import { useLiveQuery } from 'dexie-react-hooks'
import { UserPlus } from 'lucide-react'
import { db } from '../../data/db'
import { useProject } from '../shell/ProjectContext'
import { Avatar, Badge, Btn, Card, Spinner } from '../../components/ui'
import { ROLE_LABEL } from '../../lib/labels'
import { can } from '../../lib/permissions'
import { isOverdue, OPEN_STATUSES } from '../../lib/status'

export function PeoplePage() {
  const { project, me, users, companies, companyMap } = useProject()

  const defects = useLiveQuery(
    () => db.defects.where('project_id').equals(project.id).and(d => !d.archived_at).toArray(),
    [project.id],
  )

  if (!defects) return <Spinner />

  const contractorStats = (cid: string) => {
    const mine = defects.filter(d => d.assigned_company_id === cid)
    const open = mine.filter(d => OPEN_STATUSES.includes(d.status)).length
    const overdue = mine.filter(isOverdue).length
    const closed = mine.filter(d => d.status === 'closed')
    const onTime = closed.filter(d => !d.due_date || (d.closed_at ?? '') <= `${d.due_date}T23:59:59`).length
    return { open, overdue, closedCount: closed.length, onTimePct: closed.length ? Math.round((onTime / closed.length) * 100) : null }
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <section>
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-extrabold">משתמשים</h1>
          {can(me, 'people:invite') && (
            <Btn size="sm" disabled title="הזמנה בדוא&quot;ל תתאפשר עם חיבור השרת"><UserPlus size={14} /> הזמן משתמש</Btn>
          )}
        </div>
        <Card className="divide-y divide-slate-100 dark:divide-slate-800">
          {users.filter(u => u.is_active).map(u => (
            <div key={u.id} className="flex items-center gap-3 p-3.5">
              <Avatar user={u} size={38} />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm">{u.full_name}{u.id === me.id && <span className="text-slate-400 font-normal"> (אני)</span>}</div>
                <div className="text-xs text-slate-400 truncate ltr-num">{u.email}</div>
              </div>
              <div className="text-end">
                <Badge className="bg-brand/10 text-brand border-brand/20">{ROLE_LABEL[u.role]}</Badge>
                <div className="text-[10px] text-slate-400 mt-1">{companyMap.get(u.company_id)?.name}</div>
              </div>
            </div>
          ))}
        </Card>
      </section>

      <section>
        <h2 className="text-lg font-extrabold mb-3">חברות וקבלנים</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {companies.map(c => {
            const s = c.type === 'contractor' ? contractorStats(c.id) : null
            return (
              <Card key={c.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-bold">{c.name}</div>
                    <div className="text-xs text-slate-400">{c.type === 'owner' ? 'החברה שלי' : c.type === 'contractor' ? 'קבלן משנה' : 'יועץ'}</div>
                  </div>
                  {c.contact_name && <div className="text-xs text-slate-500 text-end">{c.contact_name}<br /><span className="ltr-num">{c.phone}</span></div>}
                </div>
                {s && (
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex gap-4 text-xs">
                    <span><b className="text-st-open ltr-num">{s.open}</b> פתוחים</span>
                    {s.overdue > 0 && <span className="text-st-open font-bold"><span className="ltr-num">{s.overdue}</span> באיחור</span>}
                    <span><b className="ltr-num">{s.closedCount}</b> נסגרו</span>
                    {s.onTimePct != null && <span className="ms-auto text-slate-500">עמידה בזמנים: <b className="ltr-num">{s.onTimePct}%</b></span>}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      </section>
    </div>
  )
}
