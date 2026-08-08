import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { HardHat } from 'lucide-react'
import { db } from '../../data/db'
import { useSession } from '../../state/session'
import { ICON } from '../../lib/brand'
import { Avatar, Card, Spinner } from '../../components/ui'
import { ROLE_LABEL } from '../../lib/labels'

export function LoginPage() {
  const navigate = useNavigate()
  const login = useSession(s => s.login)
  const users = useLiveQuery(() => db.users.filter(u => u.is_active && !u.archived_at).toArray(), [])

  return (
    <div className="min-h-full bg-navy flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src={ICON} alt="" className="w-20 h-20 mx-auto mb-4 rounded-2xl shadow-lg" />
          <h1 className="text-3xl font-extrabold text-white">BuildFlow</h1>
          <p className="text-slate-400 mt-1">ניהול פרויקטי בנייה — מהשטח ועד המשרד</p>
        </div>

        <Card className="p-5">
          <div className="text-sm font-semibold text-slate-500 mb-3 flex items-center gap-2">
            <HardHat size={16} className="text-accent" />
            בחר משתמש דמו לכניסה
          </div>
          {!users ? <Spinner /> : (
            <div className="space-y-2">
              {users.map(u => (
                <button key={u.id}
                  onClick={() => { login(u.id); navigate('/') }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-brand hover:bg-brand/5 transition-colors text-start">
                  <Avatar user={u} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold">{u.full_name}</div>
                    <div className="text-xs text-slate-500">{ROLE_LABEL[u.role]}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
            גרסת דמו מקומית — הנתונים נשמרים במכשיר זה בלבד (IndexedDB).
            כניסה עם סיסמה ואימות תתווסף עם חיבור השרת.
          </p>
        </Card>
      </div>
    </div>
  )
}
