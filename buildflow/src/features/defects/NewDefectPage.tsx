import { useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Camera, ChevronDown, MapPin, X } from 'lucide-react'
import { useProject } from '../shell/ProjectContext'
import { LocationPicker } from '../../components/LocationPicker'
import { Btn, Card, Input, Label, Select, TextArea } from '../../components/ui'
import { DEFECT_TYPES, SEVERITY_LABEL } from '../../lib/labels'
import { isoDaysFromNow } from '../../lib/date'
import { createDefect } from './defectService'
import { cx } from '../../lib/util'
import type { Severity } from '../../data/types'

export function NewDefectPage() {
  const { project, me, href, locations, contractors, users, locName } = useProject()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const fileRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState('')
  const [locationId, setLocationId] = useState(params.get('loc') ?? '')
  const [severity, setSeverity] = useState<Severity>('medium')
  const [moreOpen, setMoreOpen] = useState(false)
  const [dtype, setDtype] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [userId, setUserId] = useState('')
  const [due, setDue] = useState('')
  const [desc, setDesc] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)

  const pinX = params.get('px'), pinY = params.get('py'), pinV = params.get('pv')
  const companyUsers = users.filter(u => u.company_id === companyId)

  const previews = useMemo(() => files.map(f => ({ f, url: URL.createObjectURL(f) })), [files])

  const valid = title.trim().length > 1 && locationId

  async function save() {
    if (!valid || busy) return
    setBusy(true)
    try {
      const d = await createDefect({
        project_id: project.id,
        title: title.trim(),
        description: desc || undefined,
        location_id: locationId,
        pin_x: pinX ? parseFloat(pinX) : null,
        pin_y: pinY ? parseFloat(pinY) : null,
        plan_version_id: pinV || null,
        dtype: dtype || undefined,
        severity,
        assigned_company_id: companyId || null,
        assigned_user_id: userId || null,
        due_date: due || null,
      }, files, me)
      navigate(href(`defects/${d.id}`), { replace: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-xl mx-auto">
      <h1 className="text-lg font-extrabold mb-4">ליקוי חדש</h1>
      <Card className="p-4 space-y-4">
        {/* צילום — ראשון וגדול (SPEC §10.8) */}
        <div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple hidden
            onChange={e => { setFiles(f => [...f, ...Array.from(e.target.files ?? [])]); e.target.value = '' }} />
          <button onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed border-brand/40 bg-brand/5 hover:bg-brand/10 rounded-xl py-6 flex flex-col items-center gap-2 text-brand transition-colors">
            <Camera size={30} />
            <span className="font-bold text-sm">צלם או בחר תמונות</span>
          </button>
          {previews.length > 0 && (
            <div className="flex gap-2 mt-2 overflow-x-auto">
              {previews.map((p, i) => (
                <div key={i} className="relative shrink-0">
                  <img src={p.url} className="w-20 h-20 rounded-lg object-cover" alt="" />
                  <button onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -end-1.5 bg-st-open text-white rounded-full p-0.5"><X size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div><Label required>כותרת</Label>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="מה הבעיה? לדוגמה: ריצוף שקוע בסלון" autoFocus />
        </div>

        <div><Label required>מיקום</Label>
          <LocationPicker locations={locations} value={locationId} onChange={setLocationId} />
          {pinX && pinY ? (
            <div className="mt-2 text-xs bg-st-closed/10 text-st-closed border border-st-closed/30 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <MapPin size={13} /> נעוץ על התוכנית ✓ <span className="ltr-num opacity-70">({(+pinX * 100).toFixed(0)}%, {(+pinY * 100).toFixed(0)}%)</span>
            </div>
          ) : (
            <p className="text-[11px] text-slate-400 mt-1.5">טיפ: נעיצה מדויקת על תוכנית — דרך מסך "תוכניות" ← "נעץ ליקוי".</p>
          )}
        </div>

        <div><Label required>חומרה</Label>
          <div className="grid grid-cols-4 gap-1.5">
            {(Object.keys(SEVERITY_LABEL) as Severity[]).map(s => (
              <button key={s} onClick={() => setSeverity(s)}
                className={cx('py-2 rounded-lg text-xs font-bold border transition-colors',
                  severity === s
                    ? s === 'critical' ? 'bg-red-800 text-white border-red-800' : s === 'high' ? 'bg-st-open text-white border-st-open' : s === 'medium' ? 'bg-amber-500 text-white border-amber-500' : 'bg-slate-500 text-white border-slate-500'
                    : 'border-slate-300 dark:border-slate-600 text-slate-500')}>
                {SEVERITY_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        <button onClick={() => setMoreOpen(o => !o)} className="w-full flex items-center justify-between text-sm font-medium text-slate-500 py-1">
          פרטים נוספים (סוג, קבלן, מועד יעד)
          <ChevronDown size={16} className={cx('transition-transform', moreOpen && 'rotate-180')} />
        </button>

        {moreOpen && (
          <div className="space-y-4 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>סוג ליקוי</Label>
                <Select value={dtype} onChange={e => setDtype(e.target.value)}>
                  <option value="">—</option>
                  {DEFECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </Select>
              </div>
              <div><Label>קבלן אחראי</Label>
                <Select value={companyId} onChange={e => { setCompanyId(e.target.value); setUserId('') }}>
                  <option value="">—</option>
                  {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
            </div>
            {companyUsers.length > 0 && (
              <div><Label>משתמש אחראי</Label>
                <Select value={userId} onChange={e => setUserId(e.target.value)}>
                  <option value="">כל החברה</option>
                  {companyUsers.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </Select>
              </div>
            )}
            <div><Label>מועד יעד</Label>
              <div className="flex gap-1.5 mb-2">
                {[['היום', 0], ['מחר', 1], ['בעוד שבוע', 7]].map(([l, days]) => (
                  <button key={l as string} onClick={() => setDue(isoDaysFromNow(days as number))}
                    className={cx('px-3 py-1.5 rounded-full text-xs border font-medium',
                      due === isoDaysFromNow(days as number) ? 'bg-brand text-white border-brand' : 'border-slate-300 dark:border-slate-600')}>
                    {l}
                  </button>
                ))}
              </div>
              <Input type="date" value={due} onChange={e => setDue(e.target.value)} />
            </div>
            <div><Label>תיאור</Label><TextArea value={desc} onChange={e => setDesc(e.target.value)} placeholder="פירוט, מידות, הפניות…" /></div>
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <Btn variant="ghost" onClick={() => navigate(-1)}>ביטול</Btn>
          <Btn variant="primary" size="lg" className="flex-1" disabled={!valid || busy} onClick={save}>
            {busy ? 'שומר…' : 'שמור ליקוי'}
          </Btn>
        </div>
        {locationId && <p className="text-[11px] text-slate-400 text-center">ישמר תחת: {locName(locationId)}</p>}
      </Card>
    </div>
  )
}
