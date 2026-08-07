import { useEffect, useState } from 'react'
import { db } from './db'
import { uid } from '../lib/util'

export async function putBlob(blob: Blob, id?: string): Promise<string> {
  const bid = id ?? uid()
  await db.blobs.put({ id: bid, blob })
  return bid
}

export async function getBlob(id: string): Promise<Blob | null> {
  const row = await db.blobs.get(id)
  return row?.blob ?? null
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
