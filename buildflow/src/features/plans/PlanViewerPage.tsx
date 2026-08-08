import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, Check, Crosshair, LocateFixed, MapPin, Navigation, X } from 'lucide-react'
import { db } from '../../data/db'
import { dl } from '../../data/layer'
import { useBlobUrl } from '../../data/blobs'
import { useProject } from '../shell/ProjectContext'
import { PlanCanvas, type PlanPin } from './PlanCanvas'
import { Badge, Btn, Chip, Dialog, Input, Label, Spinner } from '../../components/ui'
import { STATUS_BADGE, STATUS_HEX, STATUS_LABEL } from '../../lib/labels'
import { can, visibleToUser } from '../../lib/permissions'
import { OPEN_STATUSES } from '../../lib/status'
import { fmtCoord, makeTransform } from '../../lib/geo'
import { wgs84ToItm } from '../../lib/itm'
import { BlobImg } from '../../components/BlobImg'
import type { DefectStatus, GeoRefPoint, PlanVersion } from '../../data/types'

export function PlanViewerPage() {
  const { planId = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { me, href, locations, locName } = useProject()

  const [statusFilter, setStatusFilter] = useState<DefectStatus[]>([...OPEN_STATUSES])
  const [selected, setSelected] = useState<string | null>(null)
  const [pickMode, setPickMode] = useState(false)
  const [tempPin, setTempPin] = useState<{ x: number; y: number } | null>(null)

  // ---- עיגון קואורדינטות (SPEC §7.6) ----
  const [calibActive, setCalibActive] = useState(false)
  const [calibPoints, setCalibPoints] = useState<GeoRefPoint[]>([])
  const [calibPending, setCalibPending] = useState<{ x: number; y: number } | null>(null)
  const [crs, setCrs] = useState('רשת ישראל (ITM)')
  const [ce, setCe] = useState('')
  const [cn, setCn] = useState('')
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const [gotoOpen, setGotoOpen] = useState(false)
  const [gotoE, setGotoE] = useState('')
  const [gotoN, setGotoN] = useState('')
  const [marker, setMarker] = useState<{ x: number; y: number } | null>(null)
  const [focusReq, setFocusReq] = useState<{ x: number; y: number } | null>(null)

  // ---- "המיקום שלי" — GPS על גבי התוכנית ----
  const [tracking, setTracking] = useState(false)
  const [myPos, setMyPos] = useState<{ x: number; y: number; e: number; n: number; acc: number } | null>(null)
  const [geoMsg, setGeoMsg] = useState<string | null>(null)
  const watchRef = useRef<number | null>(null)
  const firstFixRef = useRef(true)

  useEffect(() => () => {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current)
  }, [])

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

  const transform = useMemo(
    () => makeTransform(data?.version?.georef, data?.version?.width_px ?? 0, data?.version?.height_px ?? 0),
    [data?.version],
  )

  const pins = useMemo<PlanPin[]>(() => {
    if (!data) return []
    const defectPins = visibleToUser(me, data.defects)
      .filter(d => statusFilter.includes(d.status))
      .map(d => ({ id: d.id, x: d.pin_x!, y: d.pin_y!, color: STATUS_HEX[d.status], label: String(d.number) }))
    const calibPins = calibPoints.map((p, i) => ({ id: `calib-${i}`, x: p.px, y: p.py, color: '#0891b2', label: String(i + 1) }))
    return [...defectPins, ...calibPins]
  }, [data, statusFilter, me, calibPoints])

  if (!data) return <Spinner />
  if (!data.plan || !data.version) {
    return <div className="p-6 text-slate-500">התוכנית לא נמצאה או שאין לה גרסה פעילה.</div>
  }

  const focusId = params.get('focus')
  const selectedDefect = selected ? data.defects.find(d => d.id === selected) : null
  const defaultLoc = params.get('loc')
    ?? locations.find(l => l.plan_id === data.plan!.id)?.id
    ?? locations.find(l => l.type === 'floor')?.id ?? ''
  const staff = can(me, 'plan:upload')

  const confirmPick = () => {
    if (!tempPin) return
    navigate(href(`defects/new?loc=${defaultLoc}&px=${tempPin.x.toFixed(4)}&py=${tempPin.y.toFixed(4)}&pv=${data.version!.id}`))
  }

  const onPick = (x: number, y: number) => {
    if (calibActive) {
      setCalibPending({ x, y })
      setCe(''); setCn('')
    } else if (pickMode) {
      setTempPin({ x, y })
    }
  }

  async function saveCalibPoint() {
    const e = parseFloat(gotoClean(ce)), n = parseFloat(gotoClean(cn))
    if (!calibPending || !isFinite(e) || !isFinite(n)) return
    const pts = [...calibPoints, { px: calibPending.x, py: calibPending.y, e, n }]
    setCalibPending(null)
    if (pts.length < 2) {
      setCalibPoints(pts)
      return
    }
    const t = makeTransform({ points: pts, crs }, data!.version!.width_px, data!.version!.height_px)
    if (!t) {
      alert('הנקודות קרובות מדי או זהות — בחר שתי נקודות מרוחקות זו מזו.')
      setCalibPoints([])
      return
    }
    await dl.update<PlanVersion>('plan_versions', data!.version!.id, { georef: { points: pts, crs } }, me)
    setCalibPoints([])
    setCalibActive(false)
  }

  const gotoClean = (s: string) => s.replace(/,/g, '').trim()

  function stopTracking() {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current)
    watchRef.current = null
    setTracking(false)
    setMyPos(null)
    setGeoMsg(null)
  }

  function startTracking() {
    if (!transform) return
    if (!('geolocation' in navigator)) {
      setGeoMsg('הדפדפן לא תומך באיתור מיקום')
      return
    }
    setTracking(true)
    setGeoMsg('מאתר…')
    firstFixRef.current = true
    watchRef.current = navigator.geolocation.watchPosition(
      pos => {
        const { e, n } = wgs84ToItm(pos.coords.latitude, pos.coords.longitude)
        const p = transform.toPlan(e, n)
        const inBounds = p.px >= -0.08 && p.px <= 1.08 && p.py >= -0.08 && p.py <= 1.08
        if (inBounds) {
          const clamped = { x: Math.min(1, Math.max(0, p.px)), y: Math.min(1, Math.max(0, p.py)) }
          setMyPos({ ...clamped, e, n, acc: pos.coords.accuracy })
          setGeoMsg(null)
          if (firstFixRef.current) {
            firstFixRef.current = false
            setFocusReq(clamped)
          }
        } else {
          const c = transform.toWorld(0.5, 0.5)
          const dist = Math.hypot(e - c.e, n - c.n)
          setMyPos(null)
          setGeoMsg(`אתה מחוץ לגבולות התוכנית — כ-${dist < 10000 ? Math.round(dist) + ' מ\'' : (dist / 1000).toFixed(1) + ' ק"מ'} ממרכזה`)
        }
      },
      err => {
        setGeoMsg(err.code === err.PERMISSION_DENIED
          ? 'הגישה למיקום נדחתה — אשר הרשאת מיקום לאתר בהגדרות הדפדפן'
          : 'לא הצלחתי לקבל מיקום — ודא ש-GPS פעיל ונסה שוב')
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
    )
  }

  function goToCoord() {
    if (!transform) return
    const e = parseFloat(gotoClean(gotoE)), n = parseFloat(gotoClean(gotoN))
    if (!isFinite(e) || !isFinite(n)) return
    const p = transform.toPlan(e, n)
    if (p.px < -0.05 || p.px > 1.05 || p.py < -0.05 || p.py > 1.05) {
      alert(`הנ.צ. מחוץ לגבולות התוכנית (נופלת ב-${(p.px * 100).toFixed(0)}%, ${(p.py * 100).toFixed(0)}%)`)
      return
    }
    const clamped = { x: Math.min(1, Math.max(0, p.px)), y: Math.min(1, Math.max(0, p.py)) }
    setMarker(clamped)
    setFocusReq(clamped)
    setGotoOpen(false)
  }

  const hoverCoord = transform && hover ? transform.toWorld(hover.x, hover.y) : null
  const markerCoord = transform && marker ? transform.toWorld(marker.x, marker.y) : null
  const selectedCoord = transform && selectedDefect?.pin_x != null
    ? transform.toWorld(selectedDefect.pin_x!, selectedDefect.pin_y!) : null

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2.5 flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex-wrap">
        <Link to={href('plans')} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><ArrowRight size={17} /></Link>
        <div className="me-2">
          <div className="font-bold text-sm leading-tight">{data.plan.name}</div>
          <div className="text-[11px] text-slate-400 ltr-num">
            {data.plan.sheet_number} · v{data.version.version_number}
            {transform && <span className="text-emerald-600 dark:text-emerald-400"> · מכויל ({transform.crs})</span>}
          </div>
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
        {transform && (
          <Btn size="sm" variant={tracking ? 'primary' : 'default'}
            onClick={() => (tracking ? stopTracking() : startTracking())}
            title="הצג את המיקום שלי (GPS) על התוכנית">
            <Navigation size={14} /> המיקום שלי
          </Btn>
        )}
        {transform && (
          <Btn size="sm" onClick={() => { setGotoOpen(o => !o); setMarker(null) }} title="עבור לקואורדינטה">
            <Crosshair size={14} /> נ.צ.
          </Btn>
        )}
        {staff && !calibActive && !pickMode && (
          <Btn size="sm" onClick={() => { setCalibActive(true); setCalibPoints([]); setSelected(null) }}
            title={transform ? 'כיול מחדש של הקואורדינטות' : 'עיגון התוכנית לרשת קואורדינטות'}>
            <LocateFixed size={14} /> {transform ? 'כיול מחדש' : 'כיול נ.צ.'}
          </Btn>
        )}
        {can(me, 'defect:create') && !pickMode && !calibActive && (
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

      {calibActive && (
        <div className="px-4 py-2 bg-cyan-50 dark:bg-cyan-950 border-b border-cyan-300 dark:border-cyan-800 flex items-center gap-3 text-sm">
          <LocateFixed size={15} className="text-cyan-600" />
          כיול: לחץ על נקודה שהנ.צ. שלה ידועה — נקודה <b className="ltr-num">{calibPoints.length + 1}/2</b>
          <span className="text-xs text-slate-500">(פינת בניין, ציר, נקודת מדידה)</span>
          <div className="flex-1" />
          <Btn size="sm" onClick={() => { setCalibActive(false); setCalibPoints([]); setCalibPending(null) }}><X size={14} /> ביטול</Btn>
        </div>
      )}

      {gotoOpen && transform && (
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 text-sm flex-wrap">
          <Crosshair size={15} className="text-brand" />
          <span className="text-xs font-medium">עבור לנ.צ.:</span>
          <Input value={gotoE} onChange={e => setGotoE(e.target.value)} placeholder="E — מזרח" className="max-w-36 ltr-num text-xs" />
          <Input value={gotoN} onChange={e => setGotoN(e.target.value)} placeholder="N — צפון" className="max-w-36 ltr-num text-xs" />
          <Btn size="sm" variant="primary" onClick={goToCoord}>הצג על התוכנית</Btn>
          <Btn size="sm" variant="ghost" onClick={() => setGotoOpen(false)}><X size={14} /></Btn>
        </div>
      )}

      {tracking && (
        <div className="px-4 py-2 bg-blue-50 dark:bg-blue-950 border-b border-blue-300 dark:border-blue-800 flex items-center gap-3 text-sm flex-wrap">
          <Navigation size={15} className="text-blue-600 animate-pulse" />
          {myPos ? (
            <>
              <span className="ltr-num font-mono text-xs">E {fmtCoord(myPos.e)} · N {fmtCoord(myPos.n)}</span>
              <span className="text-xs text-slate-500 ltr-num">±{Math.round(myPos.acc)} מ'</span>
              {!/itm|ישראל/i.test(transform?.crs ?? '') && (
                <span className="text-xs text-amber-600">שים לב: התוכנית מכוילת ל"{transform?.crs}" — GPS מניח רשת ישראל</span>
              )}
            </>
          ) : (
            <span className="text-xs">{geoMsg ?? 'מאתר…'}</span>
          )}
          <div className="flex-1" />
          {myPos && <Btn size="sm" variant="ghost" onClick={() => setFocusReq({ x: myPos.x, y: myPos.y })}>מרכז אליי</Btn>}
          <Btn size="sm" onClick={stopTracking}><X size={14} /> הפסק</Btn>
        </div>
      )}

      {marker && markerCoord && (
        <div className="px-4 py-2 bg-accent/10 border-b border-accent/30 flex items-center gap-3 text-sm flex-wrap">
          <Crosshair size={15} className="text-accent" />
          <span className="ltr-num font-mono text-xs">E {fmtCoord(markerCoord.e)} · N {fmtCoord(markerCoord.n)}</span>
          <div className="flex-1" />
          {can(me, 'defect:create') && (
            <Btn size="sm" variant="success" onClick={() => {
              navigate(href(`defects/new?loc=${defaultLoc}&px=${marker.x.toFixed(4)}&py=${marker.y.toFixed(4)}&pv=${data.version!.id}`))
            }}><MapPin size={14} /> נעץ ליקוי כאן</Btn>
          )}
          <Btn size="sm" onClick={() => setMarker(null)}><X size={14} /> סגור</Btn>
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
            focusPoint={focusReq}
            pickMode={pickMode || calibActive}
            tempPin={calibPending ?? (pickMode ? tempPin : marker)}
            onPick={onPick}
            onHover={transform ? (x, y) => setHover({ x, y }) : undefined}
            onPinClick={id => { if (!pickMode && !calibActive && !id.startsWith('calib-')) setSelected(cur => (cur === id ? null : id)) }}
            me={myPos && transform ? { x: myPos.x, y: myPos.y, accPx: Math.max(6, myPos.acc / transform.metersPerPixel) } : null}
          />
        ) : <Spinner />}

        {/* קריאת נ.צ. חיה */}
        {hoverCoord && !calibActive && (
          <div className="absolute bottom-3 end-3 z-20 bg-navy/90 text-white text-[11px] font-mono px-3 py-1.5 rounded-lg pointer-events-none hidden sm:block" dir="ltr">
            E {fmtCoord(hoverCoord.e)} &nbsp; N {fmtCoord(hoverCoord.n)}
          </div>
        )}

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
                  {selectedCoord && (
                    <div className="text-[11px] font-mono text-slate-500 mt-0.5" dir="ltr">
                      E {fmtCoord(selectedCoord.e)} · N {fmtCoord(selectedCoord.n)}
                    </div>
                  )}
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

      {/* דיאלוג הזנת נ.צ. לנקודת כיול */}
      <Dialog open={!!calibPending} onClose={() => setCalibPending(null)} title={`נ.צ. של נקודה ${calibPoints.length + 1}`}>
        <div className="space-y-4">
          {calibPoints.length === 0 && (
            <div><Label>מערכת קואורדינטות</Label>
              <Input value={crs} onChange={e => setCrs(e.target.value)} placeholder='למשל: רשת ישראל (ITM) או "רשת מקומית"' />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><Label required>E — מזרח (מ')</Label>
              <Input value={ce} onChange={e => setCe(e.target.value)} placeholder="לדוגמה: 217650.5" className="ltr-num" autoFocus inputMode="decimal" />
            </div>
            <div><Label required>N — צפון (מ')</Label>
              <Input value={cn} onChange={e => setCn(e.target.value)} placeholder="לדוגמה: 631220.8" className="ltr-num" inputMode="decimal" />
            </div>
          </div>
          <p className="text-xs text-slate-400">
            {calibPoints.length === 0
              ? 'לאחר נקודה זו תתבקש לסמן נקודה שנייה, מרוחקת ככל האפשר מהראשונה.'
              : 'שמירת הנקודה השנייה תשלים את הכיול — קנה מידה, סיבוב והזזה יחושבו אוטומטית.'}
          </p>
          <div className="flex justify-end gap-2">
            <Btn onClick={() => setCalibPending(null)}>ביטול</Btn>
            <Btn variant="primary" disabled={!isFinite(parseFloat(gotoClean(ce))) || !isFinite(parseFloat(gotoClean(cn)))} onClick={saveCalibPoint}>
              {calibPoints.length === 0 ? 'שמור והמשך לנקודה 2' : 'שמור וסיים כיול'}
            </Btn>
          </div>
        </div>
      </Dialog>
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
