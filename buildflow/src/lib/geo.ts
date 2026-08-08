// ===== עיגון קואורדינטות (Georeferencing) — SPEC §7.6 =====
// שתי נקודות עיגון קובעות טרנספורם דמיון מלא (קנה מידה, סיבוב, הזזה)
// בין מישור התוכנית (פיקסלים, ציר y כלפי מטה) לרשת הקואורדינטות (מטרים, צפון כלפי מעלה).
// המימוש באריתמטיקה מרוכבת: world = a·plan + b.

import type { GeoRef } from '../data/types'

interface C { re: number; im: number }
const sub = (a: C, b: C): C => ({ re: a.re - b.re, im: a.im - b.im })
const add = (a: C, b: C): C => ({ re: a.re + b.re, im: a.im + b.im })
const mul = (a: C, b: C): C => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re })
const div = (a: C, b: C): C => {
  const d = b.re * b.re + b.im * b.im
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }
}
const cAbs = (a: C) => Math.hypot(a.re, a.im)

export interface GeoTransform {
  crs: string
  /** מטרים לפיקסל של התוכנית */
  metersPerPixel: number
  toWorld(px: number, py: number): { e: number; n: number }
  toPlan(e: number, n: number): { px: number; py: number }
}

/** בונה טרנספורם מהעיגון; מחזיר null אם העיגון חסר או מנוון */
export function makeTransform(georef: GeoRef | null | undefined, W: number, H: number): GeoTransform | null {
  if (!georef || georef.points.length < 2 || !W || !H) return null
  const [p1, p2] = georef.points
  const z1: C = { re: p1.px * W, im: -p1.py * H }
  const z2: C = { re: p2.px * W, im: -p2.py * H }
  const w1: C = { re: p1.e, im: p1.n }
  const w2: C = { re: p2.e, im: p2.n }
  const dz = sub(z2, z1)
  if (cAbs(dz) < 1e-6) return null
  const a = div(sub(w2, w1), dz)
  if (cAbs(a) < 1e-12) return null
  const b = sub(w1, mul(a, z1))
  return {
    crs: georef.crs,
    metersPerPixel: cAbs(a),
    toWorld(px, py) {
      const w = add(mul(a, { re: px * W, im: -py * H }), b)
      return { e: w.re, n: w.im }
    },
    toPlan(e, n) {
      const z = div(sub({ re: e, im: n }, b), a)
      return { px: z.re / W, py: -z.im / H }
    },
  }
}

export const fmtCoord = (v: number) =>
  v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
