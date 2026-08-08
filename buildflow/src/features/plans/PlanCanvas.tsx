import { useEffect, useRef, useState } from 'react'
import { Maximize2, Minus, Plus } from 'lucide-react'

// ===== צופה תוכניות: pan / zoom / pinch / סיכות — SPEC §7 =====
// הקנבס תמיד LTR (SPEC §18); רק המעטפת סביבו RTL.

export interface PlanPin {
  id: string
  x: number // 0–1
  y: number // 0–1
  color: string
  label: string
}

interface View { s: number; tx: number; ty: number }

export function PlanCanvas({ imgUrl, width, height, pins, onPinClick, pickMode, onPick, focusPin, tempPin, onHover, focusPoint, me }: {
  imgUrl: string
  width: number
  height: number
  pins: PlanPin[]
  onPinClick?: (id: string) => void
  pickMode?: boolean
  onPick?: (x: number, y: number) => void
  focusPin?: string | null
  tempPin?: { x: number; y: number } | null
  /** תנועת סמן מעל התוכנית (ללא גרירה) — לקריאת קואורדינטות */
  onHover?: (x: number, y: number) => void
  /** מרכוז התצוגה על נקודה יחסית */
  focusPoint?: { x: number; y: number } | null
  /** המיקום שלי (GPS): נקודה יחסית + רדיוס דיוק בפיקסלים של התוכנית */
  me?: { x: number; y: number; accPx: number } | null
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ s: 0.4, tx: 0, ty: 0 })
  const fitRef = useRef(0.4)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ tx: number; ty: number; s: number; d0?: number; mid0?: { x: number; y: number }; moved: boolean } | null>(null)

  const clampS = (s: number) => Math.min(8, Math.max(fitRef.current * 0.4, s))

  const fit = () => {
    const el = wrapRef.current
    if (!el) return
    const s = Math.min(el.clientWidth / width, el.clientHeight / height) * 0.95
    fitRef.current = s
    setView({ s, tx: (el.clientWidth - width * s) / 2, ty: (el.clientHeight - height * s) / 2 })
  }

  useEffect(() => {
    fit()
    const onResize = () => fit()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height])

  // מרכוז על סיכה ממוקדת
  useEffect(() => {
    if (!focusPin) return
    const p = pins.find(x => x.id === focusPin)
    const el = wrapRef.current
    if (!p || !el) return
    const s = clampS(Math.max(fitRef.current * 2.2, view.s))
    setView({ s, tx: el.clientWidth / 2 - p.x * width * s, ty: el.clientHeight / 2 + 40 - p.y * height * s })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPin, pins.length])

  // מרכוז על נקודה (למשל "עבור לנ.צ.")
  useEffect(() => {
    if (!focusPoint) return
    const el = wrapRef.current
    if (!el) return
    const s = clampS(Math.max(fitRef.current * 2, view.s))
    setView({ s, tx: el.clientWidth / 2 - focusPoint.x * width * s, ty: el.clientHeight / 2 - focusPoint.y * height * s })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPoint?.x, focusPoint?.y])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      setView(v => {
        const s = clampS(v.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15))
        const px = (mx - v.tx) / v.s, py = (my - v.ty) / v.s
        return { s, tx: mx - px * s, ty: my - py * s }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pts = [...pointers.current.values()]
    if (pts.length === 2) {
      const d0 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      gesture.current = { tx: view.tx, ty: view.ty, s: view.s, d0, mid0: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }, moved: true }
    } else {
      gesture.current = { tx: view.tx, ty: view.ty, s: view.s, moved: false }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) {
      // תנועה ללא לחיצה — דיווח קואורדינטות
      if (onHover && wrapRef.current) {
        const rect = wrapRef.current.getBoundingClientRect()
        const x = (e.clientX - rect.left - view.tx) / (view.s * width)
        const y = (e.clientY - rect.top - view.ty) / (view.s * height)
        if (x >= 0 && x <= 1 && y >= 0 && y <= 1) onHover(x, y)
      }
      return
    }
    const start = pointers.current.get(e.pointerId)!
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    const pts = [...pointers.current.values()]

    if (pts.length === 2 && g.d0 && g.mid0) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
      const rect = wrapRef.current!.getBoundingClientRect()
      const s = clampS(g.s * (d / g.d0))
      const wx = (g.mid0.x - rect.left - g.tx) / g.s, wy = (g.mid0.y - rect.top - g.ty) / g.s
      setView({ s, tx: mid.x - rect.left - wx * s, ty: mid.y - rect.top - wy * s })
    } else if (pts.length === 1) {
      const dx = e.clientX - start.x, dy = e.clientY - start.y
      if (Math.abs(dx) + Math.abs(dy) > 3) g.moved = true
      setView(v => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }))
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const wasSingle = pointers.current.size === 1
    const moved = gesture.current?.moved
    pointers.current.delete(e.pointerId)
    if (wasSingle && !moved && pickMode && onPick) {
      const rect = wrapRef.current!.getBoundingClientRect()
      const x = (e.clientX - rect.left - view.tx) / (view.s * width)
      const y = (e.clientY - rect.top - view.ty) / (view.s * height)
      if (x >= 0 && x <= 1 && y >= 0 && y <= 1) onPick(x, y)
    }
    if (pointers.current.size === 0) gesture.current = null
  }

  const zoomBy = (f: number) => {
    const el = wrapRef.current
    if (!el) return
    setView(v => {
      const s = clampS(v.s * f)
      const cx = el.clientWidth / 2, cy = el.clientHeight / 2
      const px = (cx - v.tx) / v.s, py = (cy - v.ty) / v.s
      return { s, tx: cx - px * s, ty: cy - py * s }
    })
  }

  const pinScale = 1 / view.s

  return (
    <div ref={wrapRef} dir="ltr"
      className="relative w-full h-full overflow-hidden bg-slate-200 dark:bg-slate-800 touch-none select-none"
      style={{ cursor: pickMode ? 'crosshair' : 'grab' }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>

      <div className="absolute" style={{ width, height, transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`, transformOrigin: '0 0' }}>
        <img src={imgUrl} width={width} height={height} alt="" draggable={false} className="pointer-events-none max-w-none" />
        {pins.map(p => (
          <button key={p.id}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onPinClick?.(p.id) }}
            className="absolute"
            style={{
              left: `${p.x * 100}%`, top: `${p.y * 100}%`,
              transform: `translate(-50%, -100%) scale(${pinScale})`,
              transformOrigin: '50% 100%',
              ['--pin-scale' as string]: pinScale,
              animation: focusPin === p.id ? 'pin-pulse 1.2s ease-in-out infinite' : undefined,
              zIndex: focusPin === p.id ? 10 : 1,
            }}>
            <svg width="34" height="44" viewBox="0 0 34 44" className="drop-shadow-md">
              <path d="M17 0C7.6 0 0 7.6 0 17c0 12 17 27 17 27s17-15 17-27C34 7.6 26.4 0 17 0z" fill={p.color} stroke="#fff" strokeWidth="2.5" />
              <text x="17" y="22" textAnchor="middle" fontSize="13" fontWeight="bold" fill="#fff">{p.label}</text>
            </svg>
          </button>
        ))}
        {me && (
          <>
            {/* עיגול דיוק — בקנה מידה אמיתי של התוכנית */}
            <div className="absolute pointer-events-none rounded-full"
              style={{
                left: `${me.x * 100}%`, top: `${me.y * 100}%`,
                width: me.accPx * 2, height: me.accPx * 2,
                transform: 'translate(-50%, -50%)',
                background: 'rgba(37,99,235,0.12)',
                border: '1.5px solid rgba(37,99,235,0.4)',
              }} />
            {/* הנקודה הכחולה — גודל קבוע במסך */}
            <div className="absolute pointer-events-none rounded-full" data-testid="me-dot"
              style={{
                left: `${me.x * 100}%`, top: `${me.y * 100}%`,
                width: 16, height: 16,
                transform: `translate(-50%, -50%) scale(${pinScale})`,
                background: '#2563eb',
                border: '2.5px solid #ffffff',
                animation: 'me-pulse 2s ease-in-out infinite',
              }} />
          </>
        )}
        {tempPin && (
          <div className="absolute pointer-events-none" style={{ left: `${tempPin.x * 100}%`, top: `${tempPin.y * 100}%`, transform: `translate(-50%, -100%) scale(${pinScale})`, transformOrigin: '50% 100%' }}>
            <svg width="34" height="44" viewBox="0 0 34 44" className="drop-shadow-lg">
              <path d="M17 0C7.6 0 0 7.6 0 17c0 12 17 27 17 27s17-15 17-27C34 7.6 26.4 0 17 0z" fill="#e67e22" stroke="#fff" strokeWidth="2.5" strokeDasharray="4 2" />
              <text x="17" y="23" textAnchor="middle" fontSize="16" fontWeight="bold" fill="#fff">+</text>
            </svg>
          </div>
        )}
      </div>

      <div className="absolute bottom-3 left-3 flex flex-col gap-1.5 z-20">
        <button onClick={() => zoomBy(1.3)} className="w-9 h-9 bg-white dark:bg-slate-900 rounded-lg shadow border border-slate-200 dark:border-slate-700 flex items-center justify-center"><Plus size={16} /></button>
        <button onClick={() => zoomBy(1 / 1.3)} className="w-9 h-9 bg-white dark:bg-slate-900 rounded-lg shadow border border-slate-200 dark:border-slate-700 flex items-center justify-center"><Minus size={16} /></button>
        <button onClick={fit} className="w-9 h-9 bg-white dark:bg-slate-900 rounded-lg shadow border border-slate-200 dark:border-slate-700 flex items-center justify-center"><Maximize2 size={15} /></button>
      </div>
    </div>
  )
}
