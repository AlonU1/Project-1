import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bell, CheckCheck } from 'lucide-react'
import { db } from '../../data/db'
import { dl } from '../../data/layer'
import { useProject } from '../shell/ProjectContext'
import { Btn, Card, EmptyState, Spinner } from '../../components/ui'
import { fmtRel } from '../../lib/date'
import { cx } from '../../lib/util'
import type { NotificationRow } from '../../data/types'

export function NotificationsPage() {
  const { me, href } = useProject()
  const navigate = useNavigate()

  const rows = useLiveQuery(
    () => db.notifications.where('user_id').equals(me.id).and(n => !n.archived_at).toArray(),
    [me.id],
  )

  if (!rows) return <Spinner />
  const sorted = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const unread = sorted.filter(n => !n.read_at)

  async function markAll() {
    const t = new Date().toISOString()
    for (const n of unread) await dl.update<NotificationRow>('notifications', n.id, { read_at: t }, me)
  }

  async function open(n: NotificationRow) {
    if (!n.read_at) await dl.update<NotificationRow>('notifications', n.id, { read_at: new Date().toISOString() }, me)
    if (n.entity_type === 'defect' && n.entity_id) navigate(href(`defects/${n.entity_id}`))
    else if (n.entity_type === 'task') navigate(href('tasks'))
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-extrabold">התראות {unread.length > 0 && <span className="text-sm text-accent ltr-num">({unread.length} חדשות)</span>}</h1>
        {unread.length > 0 && <Btn size="sm" onClick={markAll}><CheckCheck size={14} /> סמן הכול כנקרא</Btn>}
      </div>

      {sorted.length === 0 ? (
        <EmptyState icon={<Bell size={44} />} title="אין התראות" />
      ) : (
        <Card className="divide-y divide-slate-100 dark:divide-slate-800">
          {sorted.map(n => (
            <button key={n.id} onClick={() => open(n)} className="w-full flex items-start gap-3 p-3.5 text-start hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <span className={cx('w-2 h-2 rounded-full mt-1.5 shrink-0', n.read_at ? 'bg-slate-200 dark:bg-slate-700' : 'bg-accent')} />
              <div className="flex-1 min-w-0">
                <div className={cx('text-sm', !n.read_at && 'font-bold')}>{n.title}</div>
                {n.body && <div className="text-xs text-slate-400 mt-0.5">{n.body}</div>}
                <div className="text-[10px] text-slate-400 mt-1">{fmtRel(n.created_at)}</div>
              </div>
            </button>
          ))}
        </Card>
      )}
    </div>
  )
}
