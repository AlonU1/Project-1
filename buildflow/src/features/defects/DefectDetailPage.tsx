import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, Camera, FileText, History, MapPin, Pencil, Send, X } from 'lucide-react'
import { db } from '../../data/db'
import { dl } from '../../data/layer'
import { useProject } from '../shell/ProjectContext'
import { Avatar, Badge, Btn, Card, Spinner, TextArea } from '../../components/ui'
import { BlobImg } from '../../components/BlobImg'
import { AnnotateDialog, AnnotatedImg } from '../photos/Annotate'
import { PinPicker } from '../plans/PinPicker'
import { SEVERITY_DOT, SEVERITY_LABEL, STATUS_BADGE, STATUS_LABEL } from '../../lib/labels'
import { allowedTransitions, isOverdue } from '../../lib/status'
import { addComment, addPhotos, changeStatus } from './defectService'
import { daysUntil, fmtDate, fmtDateTime, fmtRel } from '../../lib/date'
import { cx } from '../../lib/util'
import type { Defect, DefectStatus } from '../../data/types'

export function DefectDetailPage() {
  const { defectId = '' } = useParams()
  const { me, href, userMap, companyMap, locMap, locName } = useProject()
  const [pinPickerOpen, setPinPickerOpen] = useState(false)
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [comment, setComment] = useState('')
  const [lightboxId, setLightboxId] = useState<string | null>(null)
  const [annotateId, setAnnotateId] = useState<string | null>(null)
  const [rejectOpen, setRejectOpen] = useState<DefectStatus | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const data = useLiveQuery(async () => {
    const defect = await db.defects.get(defectId)
    if (!defect) return { defect: undefined, attachments: [], comments: [], activity: [], planId: undefined }
    const [attachments, comments, activity] = await Promise.all([
      db.attachments.where('[entity_type+entity_id]').equals(['defect', defectId]).toArray(),
      db.comments.where('[entity_type+entity_id]').equals(['defect', defectId]).toArray(),
      db.activity.where('[entity_type+entity_id]').equals(['defect', defectId]).toArray(),
    ])
    const version = defect.plan_version_id ? await db.plan_versions.get(defect.plan_version_id) : undefined
    return { defect, attachments, comments, activity: activity.sort((a, b) => b.at.localeCompare(a.at)), planId: version?.plan_id }
  }, [defectId])

  if (!data) return <Spinner />
  const d = data.defect
  if (!d) return <div className="p-6 text-slate-500">הפריט לא נמצא.</div>

  const overdue = isOverdue(d)
  const transitions = allowedTransitions(me, d)
  const lightbox = lightboxId ? data.attachments.find(a => a.id === lightboxId) : null
  const annotating = annotateId ? data.attachments.find(a => a.id === annotateId) : null

  // התוכנית של מיקום הליקוי — לנעיצה/עדכון נעיצה
  const locPlanId = (() => {
    let cur = locMap.get(d.location_id)
    while (cur) {
      if (cur.plan_id) return cur.plan_id
      cur = cur.parent_id ? locMap.get(cur.parent_id) : undefined
    }
    return null
  })()
  const canPin = me.role !== 'contractor'

  async function savePin(r: { x: number; y: number; planVersionId: string }) {
    await dl.update<Defect>('defects', d!.id, { pin_x: r.x, pin_y: r.y, plan_version_id: r.planVersionId }, me)
    await dl.create('activity', {
      project_id: d!.project_id, entity_type: 'defect', entity_id: d!.id,
      action: 'pin_changed', old_value: d!.pin_x != null ? 'update' : null, new_value: null,
      at: new Date().toISOString(),
    }, me)
    setPinPickerOpen(false)
  }

  async function doTransition(to: DefectStatus, withNote?: string) {
    if (!d || busy) return
    setBusy(true)
    try {
      await changeStatus(d, to, me, withNote)
      setRejectOpen(null); setNote('')
    } finally { setBusy(false) }
  }

  async function sendComment() {
    if (!d || !comment.trim()) return
    await addComment(d.project_id, 'defect', d.id, comment.trim(), me)
    setComment('')
  }

  const creator = userMap.get(d.created_by)

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
      {/* כותרת */}
      <div className="flex items-start gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 mt-0.5"><ArrowRight size={18} /></button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-400 font-bold ltr-num">#{d.number}</span>
            <Badge className={STATUS_BADGE[d.status]}>{STATUS_LABEL[d.status]}</Badge>
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <span className={cx('w-2 h-2 rounded-full', SEVERITY_DOT[d.severity])} /> {SEVERITY_LABEL[d.severity]}
            </span>
            {overdue && <Badge className="bg-st-open/10 text-st-open border-st-open/30">⚠ {Math.abs(daysUntil(d.due_date) ?? 0)} ימי איחור</Badge>}
          </div>
          <h1 className="text-xl font-extrabold mt-1">{d.title}</h1>
          <div className="text-sm text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
            <MapPin size={13} /> {locName(d.location_id)}
            {data.planId && d.pin_x != null && (
              <Link to={href(`plans/${data.planId}?focus=${d.id}`)} className="text-brand font-medium hover:underline">· הצג בתוכנית</Link>
            )}
            {canPin && locPlanId && (
              <button onClick={() => setPinPickerOpen(true)} className="text-brand font-medium hover:underline">
                · {d.pin_x != null ? 'עדכן נעיצה' : 'נעץ על תוכנית'}
              </button>
            )}
          </div>
        </div>
        <Btn size="sm" onClick={() => navigate(href(`print/defect/${d.id}`))} title="דוח PDF לליקוי"><FileText size={14} /> PDF</Btn>
      </div>

      {/* פס פעולות סטטוס */}
      {transitions.length > 0 && (
        <Card className="p-3 flex gap-2 flex-wrap">
          {transitions.map(t => (
            <Btn key={t.to} variant={t.style === 'primary' ? 'primary' : t.style === 'success' ? 'success' : t.style === 'danger' ? 'danger' : 'neutral'}
              size="sm" disabled={busy}
              onClick={() => (t.to === 'rejected' || t.to === 'open' ? setRejectOpen(t.to) : doTransition(t.to))}>
              {t.label}
            </Btn>
          ))}
        </Card>
      )}

      {rejectOpen && (
        <Card className="p-3 space-y-2 border-st-open/40">
          <div className="text-sm font-bold">{rejectOpen === 'rejected' ? 'סיבת הדחייה' : 'סיבת הפתיחה מחדש'}</div>
          <TextArea value={note} onChange={e => setNote(e.target.value)} placeholder="מה עדיין לא תקין?" />
          <div className="flex gap-2 justify-end">
            <Btn size="sm" onClick={() => setRejectOpen(null)}>ביטול</Btn>
            <Btn size="sm" variant="danger" disabled={busy} onClick={() => doTransition(rejectOpen, note.trim() || undefined)}>אשר</Btn>
          </div>
        </Card>
      )}

      {/* תמונות */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-sm">תמונות <span className="text-slate-400 font-normal ltr-num">({data.attachments.length})</span></h3>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple hidden
            onChange={async e => {
              const fs = Array.from(e.target.files ?? [])
              e.target.value = ''
              if (fs.length) await addPhotos(d, fs, me, d.status === 'open' ? 'before' : 'after')
            }} />
          <Btn size="sm" onClick={() => fileRef.current?.click()}><Camera size={14} /> הוסף תמונה</Btn>
        </div>
        {data.attachments.length === 0 ? (
          <div className="text-xs text-slate-400 py-3 text-center">אין תמונות עדיין</div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {data.attachments.map(a => (
              <button key={a.id} onClick={() => setLightboxId(a.id)} className="relative group">
                <BlobImg blobId={a.thumb_blob_id ?? a.blob_id} className="aspect-square w-full rounded-lg" />
                <span className={cx('absolute bottom-1 start-1 text-[9px] font-bold px-1.5 py-0.5 rounded text-white',
                  a.phase === 'after' ? 'bg-st-closed' : a.phase === 'before' ? 'bg-st-open' : 'bg-slate-500')}>
                  {a.phase === 'after' ? 'אחרי' : a.phase === 'before' ? 'לפני' : 'כללי'}
                </span>
                {(a.annotations?.length ?? 0) > 0 && (
                  <span className="absolute top-1 end-1 bg-accent text-white rounded-full p-1"><Pencil size={10} /></span>
                )}
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* פרטים */}
      <Card className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
        <Info label="סוג" value={d.dtype ?? '—'} />
        <Info label="קבלן אחראי" value={d.assigned_company_id ? companyMap.get(d.assigned_company_id)?.name ?? '—' : '—'} />
        <Info label="אחראי" value={d.assigned_user_id ? userMap.get(d.assigned_user_id)?.full_name ?? '—' : 'כל החברה'} />
        <Info label="מועד יעד" value={fmtDate(d.due_date)} danger={overdue} />
        <Info label="נפתח" value={`${fmtDate(d.created_at)} · ${creator?.full_name ?? ''}`} />
        <Info label="נסגר" value={d.closed_at ? `${fmtDate(d.closed_at)} · ${d.closed_by ? userMap.get(d.closed_by)?.full_name ?? '' : ''}` : '—'} />
        {d.description && <div className="col-span-full pt-2 border-t border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300">{d.description}</div>}
      </Card>

      {/* שיחה */}
      <Card className="p-4">
        <h3 className="font-bold text-sm mb-3">שיחה <span className="text-slate-400 font-normal ltr-num">({data.comments.length})</span></h3>
        <div className="space-y-3 mb-3">
          {data.comments.map(c => {
            const author = userMap.get(c.created_by)
            return (
              <div key={c.id} className="flex gap-2.5">
                <Avatar user={author} size={30} />
                <div className="flex-1 bg-slate-50 dark:bg-slate-800 rounded-xl rounded-ss-none px-3 py-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-bold">{author?.full_name}</span>
                    <span className="text-[10px] text-slate-400">{fmtRel(c.created_at)}</span>
                  </div>
                  <div className="text-sm mt-0.5">{c.body}</div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex gap-2">
          <TextArea value={comment} onChange={e => setComment(e.target.value)} placeholder="כתוב תגובה…" className="min-h-11 flex-1"
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendComment() }} />
          <Btn variant="primary" onClick={sendComment} disabled={!comment.trim()}><Send size={15} /></Btn>
        </div>
      </Card>

      {/* היסטוריה */}
      <Card className="p-4">
        <h3 className="font-bold text-sm mb-3 flex items-center gap-1.5"><History size={15} /> היסטוריה</h3>
        <div className="space-y-2">
          {data.activity.map(a => {
            const actor = userMap.get(a.created_by)
            const label =
              a.action === 'created' ? 'פתח את הפריט' :
              a.action === 'status_changed' ? `שינה סטטוס: ${STATUS_LABEL[a.old_value as DefectStatus] ?? a.old_value} ← ${STATUS_LABEL[a.new_value as DefectStatus] ?? a.new_value}` :
              a.action === 'assigned' ? `הקצה ל${companyMap.get(a.new_value ?? '')?.name ?? 'קבלן'}` :
              a.action === 'commented' ? 'הגיב' :
              a.action === 'pin_changed' ? (a.old_value ? 'עדכן את הנעיצה על התוכנית' : 'נעץ את הליקוי על התוכנית') :
              a.action === 'attachment_added' ? `הוסיף ${a.new_value} תמונות` : a.action
            return (
              <div key={a.id} className="flex items-center gap-2 text-xs">
                <Avatar user={actor} size={22} />
                <span className="font-medium">{actor?.full_name ?? 'מערכת'}</span>
                <span className="text-slate-500 flex-1">{label}</span>
                <span className="text-slate-400 ltr-num whitespace-nowrap">{fmtDateTime(a.at)}</span>
              </div>
            )
          })}
        </div>
      </Card>

      {/* לייטבוקס */}
      {lightbox && !annotating && (
        <div className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-4 gap-3" onClick={() => setLightboxId(null)}>
          <button className="absolute top-4 end-4 text-white p-2"><X size={22} /></button>
          <div onClick={e => e.stopPropagation()}>
            <AnnotatedImg att={lightbox} maxH="75vh" />
          </div>
          <Btn size="sm" variant="primary" onClick={() => setAnnotateId(lightbox.id)}>
            <Pencil size={13} /> סמן על התמונה
          </Btn>
        </div>
      )}
      {annotating && (
        <AnnotateDialog att={annotating} me={me} onClose={() => setAnnotateId(null)} />
      )}
      {pinPickerOpen && locPlanId && (
        <PinPicker
          planId={locPlanId}
          initial={d.pin_x != null ? { x: d.pin_x, y: d.pin_y! } : null}
          onConfirm={savePin}
          onClose={() => setPinPickerOpen(false)}
        />
      )}
    </div>
  )
}

function Info({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className={cx('font-medium', danger && 'text-st-open font-bold')}>{value}</div>
    </div>
  )
}

