import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, Printer } from 'lucide-react'
import { db } from '../../../data/db'
import { useSession } from '../../../state/session'
import { ICON } from '../../../lib/brand'
import { buildLocName } from '../../shell/ProjectContext'
import { STATUS_HEX, STATUS_LABEL } from '../../../lib/labels'
import { fmtDateTime } from '../../../lib/date'
import type { Company, DefectStatus, LocationNode, Project, User } from '../../../data/types'

// ===== דוחות מודפסים: HTML מעוצב + window.print() → "שמירה כ-PDF" =====
// עברית ו-RTL מושלמים בלי הטמעת גופנים; עובד גם offline.

export interface PrintData {
  project: Project
  me: User
  users: User[]
  companies: Company[]
  locations: LocationNode[]
  userMap: Map<string, User>
  companyMap: Map<string, Company>
  locMap: Map<string, LocationNode>
  locName: (id?: string | null) => string
}

export function usePrintData(projectId: string): PrintData | null | undefined {
  const userId = useSession(s => s.userId)
  return useLiveQuery(async () => {
    const [project, me, users, companies, locations] = await Promise.all([
      db.projects.get(projectId),
      userId ? db.users.get(userId) : Promise.resolve(undefined),
      db.users.toArray(),
      db.companies.toArray(),
      db.locations.where('project_id').equals(projectId).toArray(),
    ])
    if (!project || !me) return null
    const locMap = new Map(locations.map(l => [l.id, l]))
    return {
      project, me, users, companies, locations,
      userMap: new Map(users.map(u => [u.id, u])),
      companyMap: new Map(companies.map(c => [c.id, c])),
      locMap,
      locName: buildLocName(locMap),
    }
  }, [projectId, userId])
}

export function PrintShell({ project, me, title, subtitle, children }: {
  project: Project
  me: User
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-full bg-slate-200 print:bg-white">
      {/* סרגל — לא מודפס */}
      <div className="print:hidden sticky top-0 z-10 bg-navy text-white px-4 py-2.5 flex items-center gap-3">
        <button onClick={() => history.back()} className="p-1.5 rounded-lg hover:bg-white/10"><ArrowRight size={17} /></button>
        <span className="text-sm font-bold flex-1">{title}</span>
        <button onClick={() => window.print()} className="flex items-center gap-1.5 bg-accent hover:brightness-110 rounded-lg px-3.5 py-1.5 text-sm font-bold">
          <Printer size={15} /> הדפס / שמור PDF
        </button>
      </div>

      {/* גוף הדוח */}
      <div className="max-w-[850px] mx-auto bg-white text-slate-900 p-8 my-4 print:my-0 shadow print:shadow-none rounded-lg print:rounded-none">
        <header className="flex items-start justify-between border-b-4 border-navy pb-4 mb-5">
          <div>
            <h1 className="text-2xl font-extrabold text-navy">{title}</h1>
            {subtitle && <div className="text-sm text-slate-500 mt-0.5">{subtitle}</div>}
          </div>
          <div className="text-end text-xs text-slate-500 leading-relaxed">
            <div className="flex items-center gap-2 justify-end font-extrabold text-navy text-base">
              BuildFlow <img src={ICON} alt="" className="w-6 h-6 rounded" />
            </div>
            <div className="font-bold text-slate-700">{project.name} · <span className="ltr-num">{project.code}</span></div>
            <div>הופק: <span className="ltr-num">{fmtDateTime(new Date().toISOString())}</span> · ע"י {me.full_name}</div>
          </div>
        </header>
        {children}
        <footer className="mt-8 pt-3 border-t border-slate-200 text-[10px] text-slate-400 flex justify-between">
          <span>הופק באמצעות BuildFlow</span>
          <span className="ltr-num">{project.code}</span>
        </footer>
      </div>
    </div>
  )
}

export const StatusText = ({ s }: { s: DefectStatus }) => (
  <span className="font-bold whitespace-nowrap" style={{ color: STATUS_HEX[s] }}>● {STATUS_LABEL[s]}</span>
)
