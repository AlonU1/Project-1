import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Moon, RefreshCw, Sun } from 'lucide-react'
import { db } from '../../data/db'
import { resetDemo } from '../../data/seed'
import { useSession } from '../../state/session'
import { useProject } from '../shell/ProjectContext'
import { Avatar, Btn, Card } from '../../components/ui'
import { ROLE_LABEL } from '../../lib/labels'

export function SettingsPage() {
  const { me, companyMap, project } = useProject()
  const { theme, setTheme } = useSession()
  const [busy, setBusy] = useState(false)

  const outboxCount = useLiveQuery(() => db.outbox.where('status').equals('pending').count(), [], 0)

  async function doReset() {
    if (!confirm('לאפס את כל נתוני הדמו? כל השינויים שביצעת יימחקו.')) return
    setBusy(true)
    await resetDemo()
    location.href = '/'
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-lg font-extrabold">הגדרות</h1>

      <Card className="p-4 flex items-center gap-4">
        <Avatar user={me} size={52} />
        <div className="flex-1">
          <div className="font-bold">{me.full_name}</div>
          <div className="text-sm text-slate-500">{ROLE_LABEL[me.role]} · {companyMap.get(me.company_id)?.name}</div>
          <div className="text-xs text-slate-400 ltr-num">{me.email}</div>
        </div>
      </Card>

      <Card className="p-4 flex items-center justify-between">
        <div>
          <div className="font-bold text-sm">ערכת נושא</div>
          <div className="text-xs text-slate-400">כהה — לעבודה בשעות החושך; בהיר — לשמש חזקה</div>
        </div>
        <Btn onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          {theme === 'dark' ? 'מצב בהיר' : 'מצב כהה'}
        </Btn>
      </Card>

      <Card className="p-4">
        <div className="font-bold text-sm mb-1">סנכרון</div>
        <p className="text-xs text-slate-400 leading-relaxed">
          הגרסה הנוכחית עובדת local-first: כל הנתונים נשמרים במכשיר (IndexedDB) וזמינים גם ללא רשת.
          {' '}<b className="ltr-num">{outboxCount}</b> פעולות ממתינות בתור הסנכרון — הן יעלו לענן אוטומטית כשיחובר שרת (שלב הבא במפת הדרכים).
        </p>
      </Card>

      <Card className="p-4">
        <div className="font-bold text-sm mb-1">פרויקט נוכחי</div>
        <div className="text-xs text-slate-400">{project.name} · <span className="ltr-num">{project.code}</span></div>
      </Card>

      <Card className="p-4 border-st-open/30">
        <div className="font-bold text-sm mb-1 text-st-open">איפוס נתוני דמו</div>
        <p className="text-xs text-slate-400 mb-3">מחזיר את המערכת למצב ההתחלתי — פרויקט הדמו, המשתמשים והליקויים המקוריים.</p>
        <Btn variant="danger" size="sm" disabled={busy} onClick={doReset}>
          <RefreshCw size={14} /> {busy ? 'מאפס…' : 'אפס נתוני דמו'}
        </Btn>
      </Card>

      <p className="text-center text-[11px] text-slate-400">BuildFlow v0.1 · שלבים 1–5 מתוך SPEC.md · נבנה כ-PWA עם React + Dexie</p>
    </div>
  )
}
