import { useBlobUrl } from '../data/blobs'
import { cx } from '../lib/util'
import { ImageIcon } from 'lucide-react'

export function BlobImg({ blobId, className, alt = '' }: { blobId?: string | null; className?: string; alt?: string }) {
  const url = useBlobUrl(blobId)
  if (!url) {
    return (
      <div className={cx('bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-300 dark:text-slate-600', className)}>
        <ImageIcon size={20} />
      </div>
    )
  }
  return <img src={url} alt={alt} className={cx('object-cover', className)} loading="lazy" />
}
