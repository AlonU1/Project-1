import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Bell, Building2, CalendarDays, ClipboardList, Coins, ExternalLink, FileText, Image as ImageIcon,
  LayoutDashboard, ListTodo, ListTree, LogOut, Map as MapIcon, Menu, Moon,
  Settings, Sun, Users, CloudOff, CheckCircle2, ChevronRight,
} from 'lucide-react'

/** אפליקציית הבקרה התקציבית — מערכת אחות על אותו ענן */
export const BUDGET_APP_URL = 'https://cost-managment-flame.vercel.app'
import { db } from '../../data/db'
import { useSession } from '../../state/session'
import { useSyncState } from '../../data/sync/engine'
import { Avatar, Spinner } from '../../components/ui'
import { cx } from '../../lib/util'
import { ROLE_LABEL } from '../../lib/labels'
import { ProjectCtx, buildLocName, type ProjectCtxValue } from './ProjectContext'

function SyncBadge() {
  const pending = useLiveQuery(() => db.outbox.where('status').equals('pending').count(), [], 0)
  const sync = useSyncState()
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  const view = !online
    ? { cls: 'text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950', icon: <CloudOff size={13} />, label: 'לא מקוון', title: `${pending} שינויים ממתינים — יסונכרנו כשתחזור רשת` }
    : sync.status === 'off'
    ? { cls: 'text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950', icon: <CheckCircle2 size={13} />, label: 'נשמר מקומית', title: pending ? `${pending} שינויים בתור לסנכרון עתידי` : 'כל השינויים נשמרו מקומית' }
    : sync.status === 'error'
    ? { cls: 'text-red-700 dark:text-red-400 border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950', icon: <CloudOff size={13} />, label: 'שגיאת סנכרון', title: sync.error ?? '' }
    : sync.status === 'syncing' || pending > 0
    ? { cls: 'text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950', icon: <CheckCircle2 size={13} className="animate-pulse" />, label: 'מסנכרן…', title: `${pending} בתור` }
    : { cls: 'text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950', icon: <CheckCircle2 size={13} />, label: 'מסונכרן', title: 'כל המכשירים מעודכנים' }

  return (
    <div className={cx('hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border', view.cls)} title={view.title}>
      {view.icon}
      {view.label}
      {pending > 0 && sync.status !== 'off' ? <span className="font-bold ltr-num">{pending}</span> : null}
    </div>
  )
}

export function ProjectLayout() {
  const { projectId = '' } = useParams()
  const navigate = useNavigate()
  const { userId, logout, theme, setTheme, setLastProject } = useSession()
  const [menuOpen, setMenuOpen] = useState(false)

  const data = useLiveQuery(async () => {
    const [project, me, users, companies, locations] = await Promise.all([
      db.projects.get(projectId),
      userId ? db.users.get(userId) : Promise.resolve(undefined),
      db.users.toArray(),
      db.companies.toArray(),
      db.locations.where('project_id').equals(projectId).toArray(),
    ])
    return { project, me, users, companies, locations }
  }, [projectId, userId])

  const unread = useLiveQuery(async () => {
    if (!userId) return 0
    const rows = await db.notifications.where('user_id').equals(userId).toArray()
    return rows.filter(n => !n.read_at).length
  }, [userId], 0)

  useEffect(() => { if (data?.project) setLastProject(data.project.id) }, [data?.project?.id])

  const ctx = useMemo<ProjectCtxValue | null>(() => {
    if (!data?.project || !data.me) return null
    const locMap = new Map(data.locations.map(l => [l.id, l]))
    return {
      project: data.project,
      me: data.me,
      users: data.users,
      userMap: new Map(data.users.map(u => [u.id, u])),
      companies: data.companies,
      companyMap: new Map(data.companies.map(c => [c.id, c])),
      contractors: data.companies.filter(c => c.type === 'contractor'),
      locations: data.locations.filter(l => !l.archived_at).sort((a, b) => a.sort_order - b.sort_order),
      locMap,
      href: p => `/p/${projectId}${p ? `/${p}` : ''}`,
      locName: buildLocName(locMap),
    }
  }, [data])

  if (!data) return <Spinner />
  if (!data.project || !data.me) {
    navigate('/', { replace: true })
    return null
  }

  const nav = [
    { to: '', icon: <LayoutDashboard size={18} />, label: 'דשבורד', end: true },
    { to: 'structure', icon: <ListTree size={18} />, label: 'מבנה הפרויקט' },
    { to: 'plans', icon: <MapIcon size={18} />, label: 'תוכניות' },
    { to: 'defects', icon: <ClipboardList size={18} />, label: 'ליקויים' },
    { to: 'tasks', icon: <ListTodo size={18} />, label: 'משימות' },
    { to: 'photos', icon: <ImageIcon size={18} />, label: 'תמונות' },
    { to: 'log', icon: <CalendarDays size={18} />, label: 'יומן עבודה' },
    { to: 'people', icon: <Users size={18} />, label: 'אנשים וקבלנים' },
    { to: 'reports', icon: <FileText size={18} />, label: 'דוחות' },
    { to: 'settings', icon: <Settings size={18} />, label: 'הגדרות' },
  ]
  const mobileNav = [nav[0], nav[2], nav[3], nav[4], { to: 'more', icon: <Menu size={18} />, label: 'עוד', end: false }]

  const linkCls = (isActive: boolean) => cx(
    'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
    isActive ? 'bg-brand text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
  )

  return (
    <ProjectCtx.Provider value={ctx!}>
      <div className="h-full flex flex-col">
        {/* סרגל עליון */}
        <header className="bg-navy text-white shrink-0 z-30">
          <div className="flex items-center gap-3 px-4 h-14">
            <button onClick={() => navigate('/')} className="flex items-center gap-1 hover:bg-white/10 rounded-lg px-2 py-1.5 -ms-2" title="כל הפרויקטים">
              <Building2 size={20} className="text-accent" />
              <ChevronRight size={15} className="opacity-60" />
            </button>
            <div className="min-w-0">
              <div className="font-bold leading-tight truncate">{data.project.name}</div>
              <div className="text-[11px] opacity-60 ltr-num">{data.project.code}</div>
            </div>
            <div className="flex-1" />
            <SyncBadge />
            <NavLink to="notifications" className="relative p-2 rounded-lg hover:bg-white/10">
              <Bell size={19} />
              {unread ? <span className="absolute top-0.5 start-0.5 bg-accent text-white text-[10px] font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center ltr-num">{unread}</span> : null}
            </NavLink>
            <div className="relative">
              <button onClick={() => setMenuOpen(o => !o)} className="rounded-full ring-2 ring-white/20 hover:ring-accent transition-shadow">
                <Avatar user={data.me} size={32} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute end-0 top-11 z-50 w-56 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                      <div className="font-bold text-sm">{data.me.full_name}</div>
                      <div className="text-xs text-slate-500">{ROLE_LABEL[data.me.role]}</div>
                    </div>
                    <button onClick={() => { setTheme(theme === 'dark' ? 'light' : 'dark') }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                      {theme === 'dark' ? 'מצב בהיר' : 'מצב כהה'}
                    </button>
                    <button onClick={() => { setMenuOpen(false); navigate('settings') }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                      <Settings size={16} /> הגדרות
                    </button>
                    <button onClick={() => { logout(); navigate('/login') }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-st-open hover:bg-slate-50 dark:hover:bg-slate-800 border-t border-slate-100 dark:border-slate-800">
                      <LogOut size={16} /> החלף משתמש
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 flex min-h-0">
          {/* ניווט צדדי — דסקטופ */}
          <aside className="hidden md:flex flex-col w-56 shrink-0 border-e border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 gap-1 overflow-y-auto">
            {nav.map(item => (
              <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => linkCls(isActive)}>
                {item.icon}{item.label}
              </NavLink>
            ))}
            <a href={BUDGET_APP_URL} target="_blank" rel="noopener"
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 mt-2 border-t border-slate-100 dark:border-slate-800 pt-3">
              <Coins size={18} /> בקרה תקציבית
              <ExternalLink size={12} className="ms-auto opacity-50" />
            </a>
          </aside>

          {/* תוכן */}
          <main className="flex-1 min-w-0 overflow-y-auto pb-20 md:pb-6">
            <Outlet />
          </main>
        </div>

        {/* ניווט תחתון — נייד */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex z-30 pb-[env(safe-area-inset-bottom)]">
          {mobileNav.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={({ isActive }) => cx('flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium', isActive ? 'text-brand' : 'text-slate-400')}>
              {item.icon}{item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </ProjectCtx.Provider>
  )
}
