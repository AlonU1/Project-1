import { Link } from 'react-router-dom'
import { Bell, CalendarDays, FileText, Image as ImageIcon, ListTree, Settings, Users } from 'lucide-react'
import { Card } from '../../components/ui'
import { useProject } from './ProjectContext'

export function MorePage() {
  const { href } = useProject()
  const items = [
    { to: href('structure'), icon: <ListTree size={22} />, label: 'מבנה הפרויקט' },
    { to: href('photos'), icon: <ImageIcon size={22} />, label: 'תמונות' },
    { to: href('log'), icon: <CalendarDays size={22} />, label: 'יומן עבודה' },
    { to: href('people'), icon: <Users size={22} />, label: 'אנשים וקבלנים' },
    { to: href('reports'), icon: <FileText size={22} />, label: 'דוחות' },
    { to: href('notifications'), icon: <Bell size={22} />, label: 'התראות' },
    { to: href('settings'), icon: <Settings size={22} />, label: 'הגדרות' },
  ]
  return (
    <div className="p-4 grid grid-cols-2 gap-3">
      {items.map(i => (
        <Link key={i.to} to={i.to}>
          <Card className="p-5 flex flex-col items-center gap-2 text-slate-600 dark:text-slate-300">
            {i.icon}
            <span className="text-sm font-medium">{i.label}</span>
          </Card>
        </Link>
      ))}
    </div>
  )
}
