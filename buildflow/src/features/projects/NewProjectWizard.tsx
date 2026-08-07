import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { db } from '../../data/db'
import { dl } from '../../data/layer'
import { useSession } from '../../state/session'
import { Btn, Card, Input, Label, Select, Spinner } from '../../components/ui'
import { PROJECT_TYPE_LABEL } from '../../lib/labels'
import { generateStructure, OFFICE_SPACES, RESIDENTIAL_SPACES, type StructureParams } from '../structure/generate'
import type { Project, ProjectMember, ProjectType, User } from '../../data/types'
import { cx } from '../../lib/util'

const STEPS = ['פרטים', 'מיקום וזמנים', 'צוות', 'מבנה', 'סיכום']

export function NewProjectWizard() {
  const navigate = useNavigate()
  const userId = useSession(s => s.userId)
  const me = useLiveQuery(async () => (userId ? await db.users.get(userId) : undefined), [userId])
  const users = useLiveQuery(() => db.users.filter(u => u.is_active && !u.archived_at).toArray(), [])

  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    name: '', code: '', type: 'residential' as ProjectType,
    address: '', city: '', start_date: '', end_date: '',
    pm_user_id: '', team: [] as string[],
  })
  const [st, setSt] = useState<StructureParams>({
    template: 'residential', siteName: '', buildingName: 'בניין A',
    floorFrom: 0, floorTo: 6, unitsPerFloor: 4, spaces: RESIDENTIAL_SPACES,
  })

  if (!me || !users) return <Spinner />
  const staff = users.filter(u => u.role === 'pm' || u.role === 'admin')
  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  const valid = step !== 0 || (form.name.trim().length > 1 && form.code.trim().length > 0)

  async function create() {
    setBusy(true)
    try {
      const project = await dl.create<Project>('projects', {
        company_id: me!.company_id, name: form.name.trim(), code: form.code.trim(),
        type: form.type, address: form.address, city: form.city,
        start_date: form.start_date || undefined, end_date: form.end_date || undefined,
        status: 'active', pm_user_id: form.pm_user_id || me!.id, progress_pct: 0,
      }, me)
      const teamIds = new Set([me!.id, form.pm_user_id || me!.id, ...form.team])
      for (const uid of teamIds) {
        await dl.create<ProjectMember>('members', { project_id: project.id, user_id: uid }, me)
      }
      if (st.template !== 'empty' || st.siteName) {
        await generateStructure(project.id, { ...st, siteName: st.siteName || form.name }, me!)
      }
      navigate(`/p/${project.id}`)
    } finally {
      setBusy(false)
    }
  }

  const toggleTeam = (u: User) => set('team', form.team.includes(u.id) ? form.team.filter(x => x !== u.id) : [...form.team, u.id])

  const floorsCount = st.floorTo - st.floorFrom + 1
  const totalUnits = st.template === 'empty' ? 0 : floorsCount * st.unitsPerFloor

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-extrabold mb-4">פרויקט חדש</h1>

      {/* מחוון שלבים */}
      <div className="flex items-center gap-1 mb-6">
        {STEPS.map((s, i) => (
          <div key={s} className="flex-1 flex flex-col items-center gap-1">
            <div className={cx('w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
              i < step ? 'bg-st-closed text-white' : i === step ? 'bg-brand text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500')}>
              {i < step ? <Check size={14} /> : i + 1}
            </div>
            <span className={cx('text-[10px]', i === step ? 'font-bold text-brand' : 'text-slate-400')}>{s}</span>
          </div>
        ))}
      </div>

      <Card className="p-5 space-y-4">
        {step === 0 && (
          <>
            <div><Label required>שם הפרויקט</Label><Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="לדוגמה: מגדלי הים — בניין B" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label required>קוד</Label><Input value={form.code} onChange={e => set('code', e.target.value)} placeholder="PRJ-01" className="ltr-num" /></div>
              <div><Label>סוג</Label>
                <Select value={form.type} onChange={e => { const t = e.target.value as ProjectType; set('type', t); setSt(s => ({ ...s, template: t === 'office' ? 'office' : t === 'infrastructure' ? 'infrastructure' : t === 'residential' ? 'residential' : 'empty', spaces: t === 'office' ? OFFICE_SPACES : RESIDENTIAL_SPACES })) }}>
                  {Object.entries(PROJECT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </div>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>כתובת</Label><Input value={form.address} onChange={e => set('address', e.target.value)} /></div>
              <div><Label>עיר</Label><Input value={form.city} onChange={e => set('city', e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>תאריך התחלה</Label><Input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} /></div>
              <div><Label>סיום יעד</Label><Input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} /></div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div><Label>מנהל הפרויקט</Label>
              <Select value={form.pm_user_id} onChange={e => set('pm_user_id', e.target.value)}>
                <option value="">אני ({me.full_name})</option>
                {staff.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </Select>
            </div>
            <div>
              <Label>צוות הפרויקט</Label>
              <div className="space-y-1.5">
                {users.map(u => (
                  <label key={u.id} className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer hover:border-brand">
                    <input type="checkbox" checked={form.team.includes(u.id) || u.id === me.id} disabled={u.id === me.id} onChange={() => toggleTeam(u)} className="accent-brand" />
                    <span className="text-sm font-medium">{u.full_name}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-2">הזמנת משתמשים חדשים בדוא"ל תתאפשר עם חיבור השרת.</p>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            {st.template === 'empty' ? (
              <p className="text-sm text-slate-500">ייווצר אתר ריק — את המבנה בונים ידנית במסך "מבנה הפרויקט".</p>
            ) : st.template === 'infrastructure' ? (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>מספר קטעים</Label><Input type="number" min={1} max={30} value={st.floorTo} onChange={e => setSt(s => ({ ...s, floorFrom: 1, floorTo: +e.target.value || 1 }))} /></div>
                <div><Label>מקטעים בכל קטע</Label><Input type="number" min={1} max={30} value={st.unitsPerFloor} onChange={e => setSt(s => ({ ...s, unitsPerFloor: +e.target.value || 1 }))} /></div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>שם האתר</Label><Input value={st.siteName} onChange={e => setSt(s => ({ ...s, siteName: e.target.value }))} placeholder={form.name || 'האתר'} /></div>
                  <div><Label>שם הבניין</Label><Input value={st.buildingName} onChange={e => setSt(s => ({ ...s, buildingName: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>מקומה</Label><Input type="number" value={st.floorFrom} onChange={e => setSt(s => ({ ...s, floorFrom: +e.target.value }))} /></div>
                  <div><Label>עד קומה</Label><Input type="number" value={st.floorTo} onChange={e => setSt(s => ({ ...s, floorTo: +e.target.value }))} /></div>
                  <div><Label>{st.template === 'office' ? 'אגפים בקומה' : 'דירות בקומה'}</Label><Input type="number" min={1} max={12} value={st.unitsPerFloor} onChange={e => setSt(s => ({ ...s, unitsPerFloor: +e.target.value || 1 }))} /></div>
                </div>
                <div>
                  <Label>חללים בכל {st.template === 'office' ? 'אגף' : 'דירה'}</Label>
                  <Input value={st.spaces.join(', ')} onChange={e => setSt(s => ({ ...s, spaces: e.target.value.split(',').map(x => x.trim()).filter(Boolean) }))} />
                  <p className="text-xs text-slate-400 mt-1">מופרד בפסיקים. קומה טיפוסית משוכפלת אוטומטית לכל הטווח.</p>
                </div>
              </>
            )}
          </>
        )}

        {step === 4 && (
          <div className="space-y-2 text-sm">
            <div className="font-bold text-base">{form.name} <span className="text-slate-400 ltr-num">({form.code})</span></div>
            <div>סוג: {PROJECT_TYPE_LABEL[form.type]}</div>
            {form.city && <div>מיקום: {form.address}, {form.city}</div>}
            <div>צוות: {new Set([me.id, ...form.team]).size} משתמשים</div>
            {st.template !== 'empty' && (
              <div className="p-3 bg-brand/5 rounded-lg border border-brand/20">
                ייווצר מבנה: {floorsCount} קומות · {totalUnits} {st.template === 'infrastructure' ? 'מקטעים' : st.template === 'office' ? 'אגפים' : 'דירות'}
                {st.template !== 'infrastructure' && ` · ${totalUnits * st.spaces.length} חללים`}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
          <Btn variant="ghost" onClick={() => (step === 0 ? navigate('/') : setStep(s => s - 1))}>
            <ArrowRight size={15} /> {step === 0 ? 'ביטול' : 'חזרה'}
          </Btn>
          {step < STEPS.length - 1
            ? <Btn variant="primary" disabled={!valid} onClick={() => setStep(s => s + 1)}>המשך <ArrowLeft size={15} /></Btn>
            : <Btn variant="success" disabled={busy} onClick={create}>{busy ? 'יוצר…' : 'צור פרויקט'} <Check size={15} /></Btn>}
        </div>
      </Card>
    </div>
  )
}
