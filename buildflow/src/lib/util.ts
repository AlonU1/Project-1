export const uid = () => crypto.randomUUID()

export const cx = (...a: Array<string | false | null | undefined>) => a.filter(Boolean).join(' ')

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export const initials = (name: string) =>
  name.split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('')

/** PRNG דטרמיניסטי — לנתוני דמו יציבים */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
