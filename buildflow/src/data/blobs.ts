import { useEffect, useState } from 'react'
import { db } from './db'
import { uid } from '../lib/util'
import { blobPublicUrl, syncEnabled } from './sync/config'

export async function putBlob(blob: Blob, id?: string): Promise<string> {
  const bid = id ?? uid()
  await db.blobs.put({ id: bid, blob })
  return bid
}

export async function getBlob(id: string): Promise<Blob | null> {
  const row = await db.blobs.get(id)
  if (row) return row.blob
  // תמונה שהועלתה ממכשיר אחר — נמשכת מהענן ונשמרת מקומית
  if (syncEnabled) {
    try {
      const res = await fetch(blobPublicUrl(id))
      if (res.ok) {
        const blob = await res.blob()
        await db.blobs.put({ id, blob })
        return blob
      }
    } catch { /* offline — נחזור לזה כשתהיה רשת */ }
  }
  return null
}

/** URL מקומי ל-blob, עם ניקוי אוטומטי */
export function useBlobUrl(id?: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let objUrl: string | null = null
    let cancelled = false
    if (id) {
      getBlob(id).then(b => {
        if (b && !cancelled) {
          objUrl = URL.createObjectURL(b)
          setUrl(objUrl)
        }
      })
    } else {
      setUrl(null)
    }
    return () => {
      cancelled = true
      if (objUrl) URL.revokeObjectURL(objUrl)
    }
  }, [id])
  return url
}
