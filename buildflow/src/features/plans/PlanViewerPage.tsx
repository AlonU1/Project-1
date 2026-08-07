import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, Check, MapPin, X } from 'lucide-react'
import { db } from '../../data/db'
import { useBlobUrl } from '../../data/blobs'
import { useProject } from '../shell/ProjectContext'
import { PlanCanvas, type PlanPin } from './PlanCanvas'
import { Badge, Btn, Chip, Spinner } from '../../components/ui'
import { STATUS_BADGE, STATUS_HEX, STATUS_LABEL } from '../../lib/labels'
import { can } from '../../lib/permissions'
import { visibleToUser } from '../../lib/permissions'
import { OPEN_STATUSES } from '../../lib/status'
import { BlobImg } from '../../components/BlobImg'
import type { DefectStatus } from '../../data/types'

export function PlanViewerPage() {
  const { planId = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { me, href, locations, locName } = useProject()

  const [statusFilter, setStatusFilter] = useState<DefectStatus[]>([...OPEN_STATUSES])
  const [selected, setSelected] = useState<string | null>(null)
  const [pickMode, setPickMode] = useState(false)
  const [tempPin, setTempPin] = useState<{ x: number; y: number } | null>(null)

  const data = useLiveQuery(async () => {
    const plan = await db.plans.get(planId)
    if (!plan?.current_version_id) return { plan, version: undefined, defects: [] }
    const version = await db.plan_versions.get(plan.current_version_id)
    const defects = await db.defects
      .where('project_id').equals(plan.project_id)
      .and(d => !d.archived_at && d.plan_version_id === version?.id && d.pin_x != null)
      .toArray()
    return { plan, version, defects }
  }, [planId])

  const imgUrl = useBlobUrl(data?.version?.blob_id)

  const pins = useMemo<PlanPin[]>(() => {
    if (!data) return []
    return visibleToUser(me, data.defects)
      .filter(d => statusFilter.includes(d.status))
      .map(d => ({ id: d.id, x: d.pin_x!, y: d.pin_y!, color: STATUS_HEX[d.status], label: String(d.number) }))
  }, [data, statusFilter, me])

  if (!data) return <Spinner />
  if (!data.plan || !data.version) {
    return <div className="p-6 text-slate-500">התוכנית לא נמצאה או שאין לה גרסה פעילה.</div>
  }

  const focusId = params.get('focus')
  const selectedDefect = selected ? data.defects.find(d => d.id === selected) : null
  const defaultLoc = params.get('loc')
    ?? locations.find(l => l.plan_id === data.plan!.id)?.id
    ?? locations.find(l => l.type === 'floor')?.id ?? ''

  const confirmPick = () => {
    if (!tempPin) return
    navigate(href(`defects/new?loc=${defaultLoc}&px=${tempPin.x.toFixed(4)}&py=${tempPin.y.toFixed(4)}&pv=${data.version!.id}`))
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2.5 flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex-wrap">
        <Link to={href('plans')} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><ArrowRight size={17} /></Link>
        <div className="me-2">
          <div className="font-bold text-sm leading-tight">{data.plan.name}</div>
          <div className="text-[11px] text-slate-400 ltr-num">{data.plan.sheet_number} · v{data.version.version_number}</div>
        </div>
        <div className="flex-1" />
        <div className="flex gap-1 overflow-x-auto">
          {(Object.keys(STATUS_LABEL) as DefectStatus[]).map(s => (
            <Chip key={s} active={statusFilter.includes(s)}
              onClick={() => setStatusFilter(f => f.includes(s) ? f.filter(x => x !== s) : [...f, s])}>
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: STATUS_HEX[s] }} /> {STATUS_LABEL[s]}
            </Chip>
          ))}
        </div>
        {can(me, 'defect:create') && !pickMode && (
          <Btn variant="primary" size="sm" onClick={() => { setPickMode(true); setSelected(null) }}>
            <MapPin size={14} /> נעץ ליקוי
          </Btn>
        )}
      </div>

      {pickMode && (
        <div className="px-4 py-2 bg-accent/10 border-b border-accent/30 flex items-center gap-3 text-sm">
          <MapPin size={15} className="text-accent" />
          {tempPin ? 'מיקום נבחר — אשר או הזז בלחיצה נוספת' : 'לחץ על התוכנית במיקום הליקוי'}
          <div className="flex-1" />
          {tempPin && <Btn size="sm" variant="success" onClick={confirmPick}><Check size={14} /> אשר וצור ליקוי</Btn>}
          <Btn size="sm" onClick={() => { setPickMode(false); setTempPin(null) }}><X size={14} /> ביטול</Btn>
        </div>
      )}

      <div className="flex-1 min-h-0 relative">
        {imgUrl ? (
          <PlanCanvas
            imgUrl={imgUrl}
            width={data.version.width_px}
            height={data.version.height_px}
            pins={pins}
            focusPin={focusId}
            pickMode={pickMode}
            tempPin={tempPin}
            onPick={(x, y) => setTempPin({ x, y })}
            onPinClick={id => { if (!pickMode) setSelected(cur => (cur === id ? null : id)) }}
          />
        ) : <Spinner />}

        {/* כרטיס תצוגה מהירה */}
        {selectedDefect && (
          <div className="absolute bottom-4 inset-x-4 sm:inset-x-auto sm:start-4 sm:w-96 z-30">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-3.5">
              <div className="flex items-start gap-3">
                <FirstPhoto defectId={selectedDefect.id} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge className={STATUS_BADGE[selectedDefect.status]}>#{selectedDefect.number} · {STATUS_LABEL[selectedDefect.status]}</Badge>
                  </div>
                  <div className="font-bold text-sm mt-1">{selectedDefect.title}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{locName(selectedDefect.location_id)}</div>
                </div>
                <button onClick={() => setSelected(null)} className="p-1 text-slate-400 hover:text-slate-600"><X size={15} /></button>
              </div>
              <Link to={href(`defects/${selectedDefect.id}`)}>
                <Btn variant="primary" size="sm" className="w-full mt-3">פתח פריט מלא</Btn>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function FirstPhoto({ defectId }: { defectId: string }) {
  const att = useLiveQuery(
    () => db.attachments.where('[entity_type+entity_id]').equals(['defect', defectId]).first(),
    [defectId],
  )
  return <BlobImg blobId={att?.thumb_blob_id ?? att?.blob_id} className="w-16 h-16 rounded-lg shrink-0" />
}
