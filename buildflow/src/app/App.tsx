import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { seedIfNeeded } from '../data/seed'
import { useSession } from '../state/session'
import { LoginPage } from '../features/auth/LoginPage'
import { ProjectsPage } from '../features/projects/ProjectsPage'
import { NewProjectWizard } from '../features/projects/NewProjectWizard'
import { ProjectLayout } from '../features/shell/ProjectLayout'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { StructurePage } from '../features/structure/StructurePage'
import { PlansPage } from '../features/plans/PlansPage'
import { PlanViewerPage } from '../features/plans/PlanViewerPage'
import { DefectsPage } from '../features/defects/DefectsPage'
import { NewDefectPage } from '../features/defects/NewDefectPage'
import { DefectDetailPage } from '../features/defects/DefectDetailPage'
import { TasksPage } from '../features/tasks/TasksPage'
import { PhotosPage } from '../features/photos/PhotosPage'
import { DailyLogPage } from '../features/dailylog/DailyLogPage'
import { PeoplePage } from '../features/people/PeoplePage'
import { NotificationsPage } from '../features/notifications/NotificationsPage'
import { ReportsPage } from '../features/reports/ReportsPage'
import { DefectsPrint } from '../features/reports/print/DefectsPrint'
import { DefectPrint } from '../features/reports/print/DefectPrint'
import { LogPrint } from '../features/reports/print/LogPrint'
import { SettingsPage } from '../features/settings/SettingsPage'
import { MorePage } from '../features/shell/MorePage'

function RequireAuth() {
  const userId = useSession(s => s.userId)
  if (!userId) return <Navigate to="/login" replace />
  return <Outlet />
}

export function App() {
  const [ready, setReady] = useState(false)
  const theme = useSession(s => s.theme)

  useEffect(() => {
    seedIfNeeded().then(() => setReady(true)).catch(e => {
      console.error('seed failed', e)
      setReady(true)
    })
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  if (!ready) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <img src="/icons/icon.svg" alt="" className="w-16 h-16" />
        <div className="text-slate-500 text-sm">BuildFlow — טוען…</div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/new" element={<NewProjectWizard />} />
          {/* דוחות להדפסה — מחוץ למעטפת הפרויקט */}
          <Route path="/p/:projectId/print/defects" element={<DefectsPrint />} />
          <Route path="/p/:projectId/print/defect/:defectId" element={<DefectPrint />} />
          <Route path="/p/:projectId/print/log/:logId" element={<LogPrint />} />
          <Route path="/p/:projectId" element={<ProjectLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="structure" element={<StructurePage />} />
            <Route path="plans" element={<PlansPage />} />
            <Route path="plans/:planId" element={<PlanViewerPage />} />
            <Route path="defects" element={<DefectsPage />} />
            <Route path="defects/new" element={<NewDefectPage />} />
            <Route path="defects/:defectId" element={<DefectDetailPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="photos" element={<PhotosPage />} />
            <Route path="log" element={<DailyLogPage />} />
            <Route path="people" element={<PeoplePage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="more" element={<MorePage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
