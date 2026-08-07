// רינדור עמוד PDF ל-raster עבור צופה התוכניות — SPEC §7.1
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export async function pdfPageCount(file: File): Promise<number> {
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const n = doc.numPages
  await doc.destroy()
  return n
}

export async function renderPdfPage(file: File, pageNo: number, maxW = 3200): Promise<{ blob: Blob; width: number; height: number; pages: number }> {
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pages = doc.numPages
  const page = await doc.getPage(Math.min(Math.max(1, pageNo), pages))
  const base = page.getViewport({ scale: 1 })
  const scale = Math.min(maxW / base.width, 4)
  const vp = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(vp.width)
  canvas.height = Math.round(vp.height)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport: vp }).promise

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  )
  const out = { blob, width: canvas.width, height: canvas.height, pages }
  await doc.destroy()
  return out
}
