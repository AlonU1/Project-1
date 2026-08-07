import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Image as ImageIcon, X } from 'lucide-react'
import { db } from '../../data/db'
import { useProject } from '../shell/ProjectContext'
import { Chip, EmptyState, Spinner } from '../../components/ui'
import { BlobImg } from '../../components/BlobImg'
import { AnnotatedImg } from './Annotate'
import { fmtDate, fmtDateTime } from '../../lib/date'
import type { Attachment } from '../../data/types'

export function PhotosPage() {
  const { project, userMap, locName, href } = useProject()
  const [phase, setPhase] = useState<'all' | 'before' | 'after'>('all')
  const [open, setOpen] = useState<Attachment | null>(null)

  const photos = useLiveQuery(
    () => db.attachments.where('project_id').equals(project.id).and(a => a.kind === 'photo' && !a.archived_at).toArray(),
    [project.id],
  )

  const groups = useMemo(() => {
    if (!photos) return null
    let list = [...photos].sort((a, b) => (b.taken_at ?? b.created_at).localeCompare(a.taken_at ?? a.created_at))
    if (phase !== 'all') list = list.filter(p => p.phase === phase)
    const byDay = new Map<string, Attachment[]>()
    for (const p of list) {
      const day = (p.taken_at ?? p.created_at).slice(0, 10)
      const arr = byDay.get(day) ?? []
      arr.push(p)
      byDay.set(day, arr)
    }
    return [...byDay.entries()]
  }, [photos, phase])

  if (!groups) return <Spinner />

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-extrabold">תמונות <span className="text-sm font-normal text-slate-400 ltr-num">{photos?.length ?? 0}</span></h1>
        <div className="flex gap-1.5">
          <Chip active={phase === 'all'} onClick={() => setPhase('all')}>הכול</Chip>
          <Chip active={phase === 'before'} onClick={() => setPhase('before')}>לפני</Chip>
          <Chip active={phase === 'after'} onClick={() => setPhase('after')}>אחרי</Chip>
        </div>
      </div>

      {groups.length === 0 ? (
        <EmptyState icon={<ImageIcon size={44} />} title="אין תמונות" hint="תמונות שמצורפות לליקויים ולמשימות מופיעות כאן אוטומטית" />
      ) : (
        <div className="space-y-6">
          {groups.map(([day, list]) => (
            <div key={day}>
              <h3 className="text-xs font-bold text-slate-400 mb-2 ltr-num">{fmtDate(day)}</h3>
              <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2">
                {list.map(p => (
                  <button key={p.id} onClick={() => setOpen(p)}>
                    <BlobImg blobId={p.thumb_blob_id ?? p.blob_id} className="aspect-square w-full rounded-lg hover:opacity-80 transition-opacity" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-4" onClick={() => setOpen(null)}>
          <button className="absolute top-4 end-4 text-white p-2"><X size={22} /></button>
          <div onClick={e => e.stopPropagation()}>
            <AnnotatedImg att={open} maxH="78vh" />
          </div>
          <div className="text-white/90 text-xs mt-3 text-center space-y-1" onClick={e => e.stopPropagation()}>
            <div>{locName(open.location_id)} · {userMap.get(open.created_by)?.full_name} · <span className="ltr-num">{fmtDateTime(open.taken_at ?? open.created_at)}</span></div>
            {open.entity_type === 'defect' && (
              <Link to={href(`defects/${open.entity_id}`)} className="text-accent font-bold hover:underline">פתח את הליקוי המקושר ←</Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

