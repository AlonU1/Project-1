import { useMemo } from 'react'
import { Select } from './ui'
import { LOCATION_TYPE_LABEL } from '../lib/labels'
import type { LocationNode } from '../data/types'

/** בחירת מיקום בשרשרת סלקטים: בניין → קומה → דירה → חלל */
export function LocationPicker({ locations, value, onChange }: {
  locations: LocationNode[]
  value: string
  onChange: (id: string) => void
}) {
  const { childrenOf, locMap, roots } = useMemo(() => {
    const locMap = new Map(locations.map(l => [l.id, l]))
    const childrenOf = new Map<string | null, LocationNode[]>()
    for (const l of locations) {
      const arr = childrenOf.get(l.parent_id) ?? []
      arr.push(l)
      childrenOf.set(l.parent_id, arr)
    }
    return { childrenOf, locMap, roots: childrenOf.get(null) ?? [] }
  }, [locations])

  // שרשרת הבחירה מהשורש עד הצומת הנבחר
  const chain = useMemo(() => {
    const out: string[] = []
    let cur = value ? locMap.get(value) : undefined
    while (cur) { out.unshift(cur.id); cur = cur.parent_id ? locMap.get(cur.parent_id) : undefined }
    if (out.length === 0 && roots.length === 1) out.push(roots[0].id)
    return out
  }, [value, locMap, roots])

  const levels: { options: LocationNode[]; selected: string }[] = []
  let parentId: string | null = null
  for (let i = 0; ; i++) {
    const options: LocationNode[] = (parentId === null ? roots : childrenOf.get(parentId) ?? [])
    if (options.length === 0) break
    const selected = chain[i] ?? ''
    levels.push({ options, selected })
    if (!selected) break
    parentId = selected
  }

  const pick = (levelIdx: number, id: string) => {
    if (!id) {
      onChange(chain[levelIdx - 1] ?? '')
    } else {
      onChange(id)
    }
  }

  return (
    <div className="space-y-2">
      {levels.map((lv, i) => (
        <Select key={i} value={lv.selected} onChange={e => pick(i, e.target.value)}>
          <option value="">— בחר {LOCATION_TYPE_LABEL[lv.options[0].type]} —</option>
          {lv.options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
      ))}
    </div>
  )
}
