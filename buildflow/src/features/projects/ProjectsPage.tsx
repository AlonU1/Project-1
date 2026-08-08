import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, Building2, LogOut, Plus } from 'lucide-react'
import { db } from '../../data/db'
import { useSession } from '../../state/session'
import { ICON } from '../../lib/brand'
import { Avatar, Badge, Btn, Card, Spinner } from '../../components/ui'
import { PROJECT_STATUS_LABEL, PROJECT_TYPE_LABEL } from '../../lib/labels'
import { can } from '../../lib/permissions'
import { isOverdue, OPEN_STATUSES } from '../../lib/status'
import { fmtDate } from '../../lib/date'

export function ProjectsPage() {
  const navigate = useNavigate()
  const { userId, logout } = useSession()

  const data = useLiveQuery(async () => {
    const [me, projects, defects, users, companies] = await Promise.all([
      userId ? db.users.get(userId) : Promise.resolve(undefined),
      db.projects.filter(p => !p.archived_at).toArray(),
      db.defects.filter(d => !d.archived_at).toArray(),
      db.users.toArray(),
      db.companies.toArray(),
    ])
    return { me, projects, defects, users, companies }
  }, [userId])

  if (!data) return <Spinner />
  const { me, projects, defects, users } = data
  const userMap = new Map(users.map(u => [u.id, u]))
  const myCompany = data.companies.find(c => c.id === me?.company_id)

  const stats = (pid: string) => {
    const list = defects.filter(d => d.project_id === pid)
    const open = list.filter(d => OPEN_STATUSES.includes(d.status)).length
    const overdue = list.filter(isOverdue).length
    return { open, overdue }
  }

  return (
    <div className="min-h-full">
      <header className="bg-navy text-white">
        <div className="max-w-5xl mx-auto px-4 py-6 flex items-center gap-4">
          <img src={ICON} alt="" className="w-12 h-12 rounded-xl" />
          <div className="flex-1">
            <h1 className="text-xl font-extrabold">{myCompany?.name ?? 'BuildFlow'}</h1>
            <p className="text-sm opacity-70">
              {projects.length} פרויקטים · {projects.filter(p => p.status === 'active').length} פעילים
            </p>
          </div>
          <div className="flex items-center gap-2">
            {me && <Avatar user={me} size={36} />}
            <button onClick={() => { logout(); navigate('/login') }} className="p-2 rounded-lg hover:bg-white/10" title="החלף משתמש">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg">הפרויקטים שלי</h2>
          {can(me, 'project:create') && (
            <Btn variant="primary" onClick={() => navigate('/new')}><Plus size={16} /> פרויקט חדש</Btn>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {projects.map(p => {
            const s = stats(p.id)
            const pm = p.pm_user_id ? userMap.get(p.pm_user_id) : undefined
            return (
              <Link key={p.id} to={`/p/${p.id}`}>
                <Card className="overflow-hidden hover:shadow-md transition-shadow">
                  <div className="h-2 bg-gradient-to-l from-brand to-accent" />
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-base">{p.name}</div>
                        <div className="text-xs text-slate-500 ltr-num">{p.code} · {PROJECT_TYPE_LABEL[p.type]}</div>
                      </div>
                      <Badge className="bg-brand/10 text-brand border-brand/20">{PROJECT_STATUS_LABEL[p.status]}</Badge>
                    </div>

                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>התקדמות</span><span className="ltr-num font-semibold">{p.progress_pct}%</span>
                      </div>
                      <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-brand rounded-full" style={{ width: `${p.progress_pct}%` }} />
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                      {pm && <span className="flex items-center gap-1.5"><Avatar user={pm} size={20} />{pm.full_name}</span>}
                      <span className="ltr-num">{fmtDate(p.start_date)} – {fmtDate(p.end_date)}</span>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-4 text-xs">
                      <span className="flex items-center gap-1 text-st-open font-semibold">
                        <span className="w-2 h-2 rounded-full bg-st-open" /> {s.open} ליקויים פתוחים
                      </span>
                      {s.overdue > 0 && (
                        <span className="flex items-center gap-1 text-amber-600 font-semibold">
                          <AlertTriangle size={13} /> {s.overdue} באיחור
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>

        {projects.length === 0 && (
          <Card className="p-10 text-center text-slate-400">
            <Building2 size={40} className="mx-auto mb-3 opacity-40" />
            אין עדיין פרויקטים
          </Card>
        )}
      </div>
    </div>
  )
}
