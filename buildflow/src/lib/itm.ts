// ===== המרת WGS84 (GPS) → רשת ישראל החדשה ITM, EPSG:2039 =====
// שלב 1: הסטת דאטום WGS84→GRS80/IG05 (מולודנסקי מקוצר)
// שלב 2: היטל טרנסוורס-מרקטור עם פרמטרי רשת ישראל
// דיוק ההמרה ~מטר — הרבה מתחת לדיוק GPS אזרחי (3–15מ').

const D2R = Math.PI / 180

const WGS84 = { a: 6378137, f: 1 / 298.257223563 }
const GRS80 = { a: 6378137, f: 1 / 298.257222101 }

// הסטת דאטום WGS84 → ישראל (ערכים מקובלים)
const DX = -24.0024, DY = -17.1032, DZ = -17.8444

// פרמטרי היטל ITM (EPSG:2039)
const LON0 = 35.20451694444444 * D2R  // 35°12'16.261"
const LAT0 = 31.73439361111111 * D2R  // 31°44'03.817"
const K0 = 1.0000067
const FE = 219529.584
const FN = 626907.39

function molodensky(lat: number, lon: number) {
  const slat = Math.sin(lat), clat = Math.cos(lat)
  const slon = Math.sin(lon), clon = Math.cos(lon)
  const a = WGS84.a, f = WGS84.f
  const da = GRS80.a - WGS84.a
  const df = GRS80.f - WGS84.f
  const esq = f * (2 - f)
  const bda = 1 - f
  const denom = 1 - esq * slat * slat
  const rn = a / Math.sqrt(denom)
  const rm = (a * (1 - esq)) / Math.pow(denom, 1.5)
  const dlat = (
    -DX * slat * clon - DY * slat * slon + DZ * clat
    + (da * (rn * esq * slat * clat)) / a
    + df * (rm / bda + rn * bda) * slat * clat
  ) / rm
  const dlon = (-DX * slon + DY * clon) / (rn * clat)
  return { lat: lat + dlat, lon: lon + dlon }
}

function meridianArc(lat: number, a: number, e2: number) {
  const e4 = e2 * e2, e6 = e4 * e2
  return a * (
    (1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * lat
    - ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * lat)
    + ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * lat)
    - ((35 * e6) / 3072) * Math.sin(6 * lat)
  )
}

function tmProject(lat: number, lon: number) {
  const a = GRS80.a, f = GRS80.f
  const e2 = f * (2 - f)
  const ep2 = e2 / (1 - e2)
  const slat = Math.sin(lat), clat = Math.cos(lat)
  const N = a / Math.sqrt(1 - e2 * slat * slat)
  const T = Math.tan(lat) ** 2
  const C = ep2 * clat * clat
  const A = (lon - LON0) * clat
  const M = meridianArc(lat, a, e2)
  const M0 = meridianArc(LAT0, a, e2)
  const e = FE + K0 * N * (
    A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5) / 120
  )
  const n = FN + K0 * (
    M - M0 + N * Math.tan(lat) * (
      (A * A) / 2 + ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24
      + ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6) / 720
    )
  )
  return { e, n }
}

/** קלט במעלות (כפי שמגיע מ-navigator.geolocation), פלט E/N במטרים ברשת ישראל */
export function wgs84ToItm(latDeg: number, lonDeg: number): { e: number; n: number } {
  const s = molodensky(latDeg * D2R, lonDeg * D2R)
  return tmProject(s.lat, s.lon)
}

// חשיפה לצורכי בדיקה/דיבוג בקונסול
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__itm = wgs84ToItm
}
