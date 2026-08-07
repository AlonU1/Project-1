import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { FileUp, Map as MapIcon } from 'lucide-react'
import { db } from '../../data/db'
import { dl } from '../../data/layer'
import { putBlob } from '../../data/blobs'
import { imageDimensions } from '../../lib/image'
import { useProject } from '../shell/ProjectContext'
import { Btn, Card, Dialog, EmptyState, Input, Label, Select, Spinner } from '../../components/ui'
import { can } from '../../lib/permissions'
import { fmtDate } from '../../lib/date'
import type { LocationNode, Plan, PlanVersion } from '../../data/types'

const DISCIPLINES = { architecture: 'אדריכלות', structure: 'קונסטרוקציה', mep: 'מערכות', other: 'אחר' } as const

export function PlansPage() {
  const { project, me, href, locations } = useProject()
  const [upOpen, setUpOpen] = useState(false)

  const plans = useLiveQuery(
    () => db.plans.where('project_id').equals(project.id).and(p => !p.archived_at).toArray(),
    [project.id],
  )

  const floorsFor = (planId: string) => locations.filter(l => l.plan_id === planId).map(l => l.name).join(', ')

  if (!plans) return <Spinner />

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-extrabold">תוכניות</h1>
        {can(me, 'plan:upload') && <Btn variant="primary" onClick={() => setUpOpen(true)}><FileUp size={15} /> העלאת תוכנית</Btn>}
      </div>

      {plans.length === 0 ? (
        <EmptyState icon={<MapIcon size={44} />} title="אין תוכניות עדיין" hint="העלה תוכנית קומה (PNG / JPG / SVG) ושייך אותה לקומות. תמיכה ב-PDF תתווסף בשלב 4." />
      ) : (
        <div className="space-y-3">
          {plans.map(p => (
            <Link key={p.id} to={href(`plans/${p.id}`)}>
              <Card className="p-4 flex items-center gap-4 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0"><MapIcon size={22} /></div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold">{p.name}</div>
                  <div className="text-xs text-slate-500">
                    <span className="ltr-num">{p.sheet_number}</span> · {DISCIPLINES[p.discipline]} · {fmtDate(p.created_at)}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5 truncate">{floorsFor(p.id) ? `משויכת ל: ${floorsFor(p.id)}` : 'לא משויכת לקומות'}</div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <UploadDialog open={upOpen} onClose={() => setUpOpen(false)} />
    </div>
  )
}

function UploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { project, me, locations } = useProject()
  const [name, setName] = useState('')
  const [sheet, setSheet] = useState('')
  const [disc, setDisc] = useState<Plan['discipline']>('architecture')
  const [file, setFile] = useState<File | null>(null)
  const [pdfPages, setPdfPages] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [floorIds, setFloorIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const floors = locations.filter(l => l.type === 'floor')

  async function onFile(f: File | null) {
    setFile(f)
    setPdfPages(null)
    setPage(1)
    if (f && f.type === 'application/pdf') {
      const { pdfPageCount } = await import('../../lib/pdf')
      setPdfPages(await pdfPageCount(f))
    }
  }

  async function save() {
    if (!file || !name.trim()) return
    setBusy(true)
    try {
      const isPdf = file.type === 'application/pdf'
      let blobId: string, w: number, h: number
      if (isPdf) {
        const { renderPdfPage } = await import('../../lib/pdf')
        const r = await renderPdfPage(file, page)
        blobId = await putBlob(r.blob)
        w = r.width; h = r.height
      } else {
        const dims = await imageDimensions(file)
        blobId = await putBlob(file)
        w = dims.w; h = dims.h
      }
      const plan = await dl.create<Plan>('plans', {
        project_id: project.id, name: name.trim(), discipline: disc,
        sheet_number: sheet || undefined, current_version_id: null,
      }, me)
      const ver = await dl.create<PlanVersion>('plan_versions', {
        plan_id: plan.id, version_number: 1, blob_id: blobId,
        file_type: isPdf ? 'pdf' : file.type.includes('svg') ? 'svg' : file.type.includes('png') ? 'png' : 'jpg',
        page_number: isPdf ? page : undefined,
        width_px: w, height_px: h, is_current: true,
      }, me)
      await dl.update<Plan>('plans', plan.id, { current_version_id: ver.id }, me)
      for (const fid of floorIds) {
        await dl.update<LocationNode>('locations', fid, { plan_id: plan.id }, me)
      }
      onClose()
      setName(''); setSheet(''); setFile(null); setPdfPages(null); setFloorIds([])
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="העלאת תוכנית">
      <div className="space-y-4">
        <div><Label required>קובץ (PDF / PNG / JPG / SVG)</Label>
          <Input type="file" accept="application/pdf,image/png,image/jpeg,image/svg+xml" onChange={e => onFile(e.target.files?.[0] ?? null)} />
          {pdfPages != null && (
            <div className="flex items-center gap-2 mt-2 text-sm">
              <span className="text-slate-500">PDF עם <b className="ltr-num">{pdfPages}</b> עמודים · עמוד להצגה:</span>
              <Input type="number" min={1} max={pdfPages} value={page} onChange={e => setPage(+e.target.value || 1)} className="w-20 ltr-num" />
            </div>
          )}
        </div>
        <div><Label required>שם התוכנית</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="תוכנית קומה טיפוסית" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>מספר גיליון</Label><Input value={sheet} onChange={e => setSheet(e.target.value)} placeholder="A-101" className="ltr-num" /></div>
          <div><Label>דיסציפלינה</Label>
            <Select value={disc} onChange={e => setDisc(e.target.value as Plan['discipline'])}>
              {Object.entries(DISCIPLINES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </div>
        </div>
        {floors.length > 0 && (
          <div>
            <Label>שיוך לקומות</Label>
            <div className="flex flex-wrap gap-1.5">
              {floors.map(f => (
                <button key={f.id} type="button"
                  onClick={() => setFloorIds(ids => ids.includes(f.id) ? ids.filter(x => x !== f.id) : [...ids, f.id])}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border ${floorIds.includes(f.id) ? 'bg-brand text-white border-brand' : 'border-slate-300 dark:border-slate-600'}`}>
                  {f.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>ביטול</Btn>
          <Btn variant="primary" disabled={!file || !name.trim() || busy} onClick={save}>{busy ? 'מעלה…' : 'העלה'}</Btn>
        </div>
      </div>
    </Dialog>
  )
}
