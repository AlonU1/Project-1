import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, MapPin, X } from 'lucide-react'
import { db } from '../../data/db'
import { useBlobUrl } from '../../data/blobs'
import { PlanCanvas } from './PlanCanvas'
import { Btn, Spinner } from '../../components/ui'

/** שכבת בחירת נקודה על תוכנית — לנעיצת ליקוי מתוך טופס, בלי לאבד את הטופס */
export function PinPicker({ planId, initial, onConfirm, onClose }: {
  planId: string
  initial?: { x: number; y: number } | null
  onConfirm: (r: { x: number; y: number; planVersionId: string }) => void
  onClose: () => void
}) {
  const [pin, setPin] = useState<{ x: number; y: number } | null>(initial ?? null)

  const data = useLiveQuery(async () => {
    const plan = await db.plans.get(planId)
    const version = plan?.current_version_id ? await db.plan_versions.get(plan.current_version_id) : undefined
    return { plan, version }
  }, [planId])

  const url = useBlobUrl(data?.version?.blob_id)

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/80 flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 bg-navy text-white">
        <MapPin size={17} className="text-accent" />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm truncate">{data?.plan?.name ?? 'טוען תוכנית…'}</div>
          <div className="text-[11px] opacity-70">{pin ? 'נקודה נבחרה — אפשר לדייק בלחיצה נוספת' : 'לחץ על מיקום הליקוי בתוכנית'}</div>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10"><X size={18} /></button>
      </div>

      <div className="flex-1 min-h-0">
        {data?.version && url ? (
          <PlanCanvas
            imgUrl={url}
            width={data.version.width_px}
            height={data.version.height_px}
            pins={[]}
            pickMode
            tempPin={pin}
            onPick={(x, y) => setPin({ x, y })}
          />
        ) : data && !data.version ? (
          <div className="p-8 text-center text-slate-300">לתוכנית אין גרסה פעילה.</div>
        ) : <Spinner />}
      </div>

      <div className="flex items-center gap-2 px-4 py-3 bg-navy">
        <div className="flex-1" />
        <Btn variant="neutral" onClick={onClose}>ביטול</Btn>
        <Btn variant="success" size="lg" disabled={!pin || !data?.version}
          onClick={() => pin && data?.version && onConfirm({ ...pin, planVersionId: data.version.id })}>
          <Check size={16} /> אשר נעיצה
        </Btn>
      </div>
    </div>
  )
}
