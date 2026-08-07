import { useRef, useState } from 'react'
import { Check, Circle, MoveUpLeft, Pencil, RotateCcw, Square, Trash2, Type, X } from 'lucide-react'
import { dl } from '../../data/layer'
import { useBlobUrl } from '../../data/blobs'
import { Btn } from '../../components/ui'
import { cx } from '../../lib/util'
import type { AnnoShape, Attachment, User } from '../../data/types'

// ===== סימון על גבי תמונה — SPEC §7.5. וקטורי, יחסי, המקור לא משתנה. =====

const COLORS = ['#dc2626', '#eab308', '#16a34a']
type Tool = 'arrow' | 'rect' | 'ellipse' | 'free' | 'text'

function ShapeSvg({ s, W, H }: { s: AnnoShape; W: number; H: number }) {
  const sw = Math.max(W, H) / 130
  const common = { stroke: s.c, strokeWidth: sw, fill: 'none' as const, strokeLinecap: 'round' as const }
  switch (s.t) {
    case 'rect':
      return <rect x={s.x * W} y={s.y * H} width={s.w * W} height={s.h * H} {...common} />
    case 'ellipse':
      return <ellipse cx={s.cx * W} cy={s.cy * H} rx={Math.abs(s.rx) * W} ry={Math.abs(s.ry) * H} {...common} />
    case 'free':
      return <polyline points={s.pts.map((v, i) => v * (i % 2 === 0 ? W : H)).join(' ')} {...common} strokeLinejoin="round" />
    case 'text':
      return <text x={s.x * W} y={s.y * H} fill={s.c} fontSize={Math.max(W, H) / 22} fontWeight="bold" direction="rtl" style={{ paintOrder: 'stroke', stroke: '#ffffff', strokeWidth: sw / 2 }}>{s.s}</text>
    case 'arrow': {
      const x1 = s.x1 * W, y1 = s.y1 * H, x2 = s.x2 * W, y2 = s.y2 * H
      const ang = Math.atan2(y2 - y1, x2 - x1)
      const hl = Math.max(W, H) / 28
      const p1 = [x2 - hl * Math.cos(ang - 0.45), y2 - hl * Math.sin(ang - 0.45)]
      const p2 = [x2 - hl * Math.cos(ang + 0.45), y2 - hl * Math.sin(ang + 0.45)]
      return (
        <g>
          <line x1={x1} y1={y1} x2={x2} y2={y2} {...common} />
          <polygon points={`${x2},${y2} ${p1[0]},${p1[1]} ${p2[0]},${p2[1]}`} fill={s.c} stroke="none" />
        </g>
      )
    }
  }
}

/** תמונה + שכבת הסימונים שלה (לקריאה).
 *  העטיפה מקבלת מידות מפורשות + aspect-ratio כדי למנוע קריסת shrink-wrap ל-0. */
export function AnnotatedImg({ att, className, maxH = '80vh' }: { att: Attachment; className?: string; maxH?: string }) {
  const url = useBlobUrl(att.blob_id)
  const W = att.width || 800, H = att.height || 600
  if (!url) return null
  return (
    <div className={cx('relative', className)} dir="ltr"
      style={{ width: W, maxWidth: '100%', maxHeight: maxH, aspectRatio: `${W} / ${H}` }}>
      <img src={url} alt="" className="absolute inset-0 w-full h-full object-fill rounded-lg" />
      {(att.annotations?.length ?? 0) > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
          {att.annotations!.map((s, i) => <ShapeSvg key={i} s={s} W={W} H={H} />)}
        </svg>
      )}
    </div>
  )
}

/** עורך הסימון — מסך מלא */
export function AnnotateDialog({ att, me, onClose }: { att: Attachment; me: User; onClose: () => void }) {
  const url = useBlobUrl(att.blob_id)
  const W = att.width || 800, H = att.height || 600
  const [shapes, setShapes] = useState<AnnoShape[]>(att.annotations ?? [])
  const [temp, setTemp] = useState<AnnoShape | null>(null)
  const [tool, setTool] = useState<Tool>('arrow')
  const [color, setColor] = useState(COLORS[0])
  const [busy, setBusy] = useState(false)
  const surfRef = useRef<SVGSVGElement>(null)
  const drawing = useRef(false)

  const rel = (e: React.PointerEvent) => {
    const r = surfRef.current!.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    }
  }

  const down = (e: React.PointerEvent) => {
    e.preventDefault()
    const { x, y } = rel(e)
    if (tool === 'text') {
      const s = prompt('טקסט לסימון:')
      if (s?.trim()) setShapes(list => [...list, { t: 'text', x, y, s: s.trim(), c: color }])
      return
    }
    drawing.current = true
    surfRef.current!.setPointerCapture(e.pointerId)
    setTemp(
      tool === 'arrow' ? { t: 'arrow', x1: x, y1: y, x2: x, y2: y, c: color }
      : tool === 'rect' ? { t: 'rect', x, y, w: 0, h: 0, c: color }
      : tool === 'ellipse' ? { t: 'ellipse', cx: x, cy: y, rx: 0, ry: 0, c: color }
      : { t: 'free', pts: [x, y], c: color },
    )
  }

  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return
    const { x, y } = rel(e)
    setTemp(t => {
      if (!t) return t
      switch (t.t) {
        case 'arrow': return { ...t, x2: x, y2: y }
        case 'rect': return { ...t, w: x - t.x, h: y - t.y }
        case 'ellipse': return { ...t, rx: x - t.cx, ry: y - t.cy }
        case 'free': {
          const n = t.pts.length
          const dx = x - t.pts[n - 2], dy = y - t.pts[n - 1]
          if (Math.hypot(dx, dy) < 0.004) return t
          return { ...t, pts: [...t.pts, x, y] }
        }
        default: return t
      }
    })
  }

  const up = () => {
    if (!drawing.current) return
    drawing.current = false
    setTemp(t => {
      if (t) {
        // התעלמות מקליק ריק ללא גרירה
        const tiny =
          (t.t === 'rect' && Math.abs(t.w) < 0.01 && Math.abs(t.h) < 0.01) ||
          (t.t === 'ellipse' && Math.abs(t.rx) < 0.01 && Math.abs(t.ry) < 0.01) ||
          (t.t === 'arrow' && Math.hypot(t.x2 - t.x1, t.y2 - t.y1) < 0.01) ||
          (t.t === 'free' && t.pts.length < 6)
        if (!tiny) setShapes(list => [...list, t])
      }
      return null
    })
  }

  async function save() {
    setBusy(true)
    try {
      await dl.update<Attachment>('attachments', att.id, { annotations: shapes }, me)
      onClose()
    } finally { setBusy(false) }
  }

  const tools: { t: Tool; icon: React.ReactNode; label: string }[] = [
    { t: 'arrow', icon: <MoveUpLeft size={16} />, label: 'חץ' },
    { t: 'rect', icon: <Square size={16} />, label: 'מלבן' },
    { t: 'ellipse', icon: <Circle size={16} />, label: 'עיגול' },
    { t: 'free', icon: <Pencil size={16} />, label: 'חופשי' },
    { t: 'text', icon: <Type size={16} />, label: 'טקסט' },
  ]

  return (
    <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col">
      <div className="flex items-center gap-2 p-3 flex-wrap bg-slate-900/90">
        <span className="text-white text-sm font-bold me-2">סימון על התמונה</span>
        {tools.map(t => (
          <button key={t.t} onClick={() => setTool(t.t)} title={t.label}
            className={cx('p-2 rounded-lg text-white', tool === t.t ? 'bg-brand' : 'bg-white/10 hover:bg-white/20')}>
            {t.icon}
          </button>
        ))}
        <span className="w-px h-6 bg-white/20 mx-1" />
        {COLORS.map(c => (
          <button key={c} onClick={() => setColor(c)} title={c}
            className={cx('w-7 h-7 rounded-full border-2', color === c ? 'border-white scale-110' : 'border-transparent')}
            style={{ backgroundColor: c }} />
        ))}
        <span className="w-px h-6 bg-white/20 mx-1" />
        <button onClick={() => setShapes(s => s.slice(0, -1))} disabled={!shapes.length} title="בטל אחרון"
          className="p-2 rounded-lg text-white bg-white/10 hover:bg-white/20 disabled:opacity-30"><RotateCcw size={16} /></button>
        <button onClick={() => setShapes([])} disabled={!shapes.length} title="נקה הכול"
          className="p-2 rounded-lg text-white bg-white/10 hover:bg-white/20 disabled:opacity-30"><Trash2 size={16} /></button>
        <div className="flex-1" />
        <Btn size="sm" variant="success" disabled={busy} onClick={save}><Check size={14} /> שמור</Btn>
        <Btn size="sm" variant="neutral" onClick={onClose}><X size={14} /> סגור</Btn>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden" dir="ltr">
        {url && (
          <div className="relative" style={{ width: W, maxWidth: '92vw', maxHeight: '78vh', aspectRatio: `${W} / ${H}` }}>
            <img src={url} alt="" className="absolute inset-0 w-full h-full object-fill rounded" draggable={false} />
            <svg ref={surfRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
              data-testid="anno-surface"
              onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
              {shapes.map((s, i) => <ShapeSvg key={i} s={s} W={W} H={H} />)}
              {temp && <ShapeSvg s={temp} W={W} H={H} />}
            </svg>
          </div>
        )}
      </div>
    </div>
  )
}
