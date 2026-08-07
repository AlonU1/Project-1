// דחיסת תמונות בצד לקוח — SPEC §9.1. ללא תלות חיצונית.

async function drawToBlob(bitmap: ImageBitmap, maxSide: number, quality: number): Promise<{ blob: Blob; w: number; h: number }> {
  const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * ratio)
  const h = Math.round(bitmap.height * ratio)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, w, h)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', quality),
  )
  return { blob, w, h }
}

export interface CompressedImage {
  full: Blob
  thumb: Blob
  width: number
  height: number
}

export async function compressImage(file: File): Promise<CompressedImage> {
  // SVG וקבצים קטנים מאוד — נשמרים כמו שהם
  if (file.type === 'image/svg+xml') {
    return { full: file, thumb: file, width: 1600, height: 1100 }
  }
  const bitmap = await createImageBitmap(file)
  const full = await drawToBlob(bitmap, 1600, 0.8)
  const thumb = await drawToBlob(bitmap, 320, 0.7)
  bitmap.close()
  return { full: full.blob, thumb: thumb.blob, width: full.w, height: full.h }
}

export function imageDimensions(blob: Blob): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url) }
    img.onerror = () => { reject(new Error('image load failed')); URL.revokeObjectURL(url) }
    img.src = url
  })
}
