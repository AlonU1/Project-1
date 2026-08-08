import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CloudUpload, Moon, RefreshCw, Sun } from 'lucide-react'
import { db } from '../../data/db'
import { resetDemo } from '../../data/seed'
import { syncEnabled } from '../../data/sync/config'
import { syncNow, useSyncState } from '../../data/sync/engine'
import { useSession } from '../../state/session'
import { useProject } from '../shell/ProjectContext'
import { Avatar, Btn, Card } from '../../components/ui'
import { ROLE_LABEL } from '../../lib/labels'
import { fmtRel } from '../../lib/date'

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

      <SyncCard outboxCount={outboxCount ?? 0} />

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

      <p className="text-center text-[11px] text-slate-400">BuildFlow v0.3 · שלבים 1–7 + דוחות + סנכרון ענן · נבנה כ-PWA עם React + Dexie + Supabase</p>
    </div>
  )
}

function SyncCard({ outboxCount }: { outboxCount: number }) {
  const sync = useSyncState()
  const [busy, setBusy] = useState(false)

  if (!syncEnabled) {
    return (
      <Card className="p-4">
        <div className="font-bold text-sm mb-1">סנכרון בין מכשירים</div>
        <p className="text-xs text-slate-400 leading-relaxed">
          חיבור הענן עדיין לא הוגדר — הנתונים נשמרים במכשיר זה בלבד (וזמינים גם ללא רשת).
          {' '}<b className="ltr-num">{outboxCount}</b> פעולות ממתינות בתור ויעלו אוטומטית ברגע שהחיבור יופעל.
        </p>
      </Card>
    )
  }

  const statusLabel =
    sync.status === 'syncing' ? 'מסנכרן…' :
    sync.status === 'error' ? 'שגיאה' :
    outboxCount > 0 ? 'ממתין לדחיפה' : 'מסונכרן'

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-1">
        <div className="font-bold text-sm">סנכרון בין מכשירים</div>
        <Btn size="sm" disabled={busy || sync.status === 'syncing'} onClick={async () => { setBusy(true); await syncNow(); setBusy(false) }}>
          <CloudUpload size={14} /> סנכרן עכשיו
        </Btn>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">
        מצב: <b>{statusLabel}</b>
        {sync.lastSync && <> · סנכרון אחרון {fmtRel(sync.lastSync)}</>}
        {' '}· <b className="ltr-num">{outboxCount}</b> פעולות בתור.
        שינויים שתבצע כאן יופיעו בכל מכשיר שפתוח על אותה כתובת, גם בנייד.
      </p>
      {sync.status === 'error' && (
        <p className="text-xs text-st-open mt-2 break-all">{sync.error}</p>
      )}
    </Card>
  )
}
