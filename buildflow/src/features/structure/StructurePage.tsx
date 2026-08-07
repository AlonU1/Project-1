import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, ChevronDown, ChevronLeft, ListTree, Map as MapIcon, Plus } from 'lucide-react'
import { db } from '../../data/db'
import { dl } from '../../data/layer'
import { useProject } from '../shell/ProjectContext'
import { Badge, Btn, Card, Dialog, EmptyState, Input, Label, Select } from '../../components/ui'
import { LOCATION_TYPE_LABEL } from '../../lib/labels'
import { can } from '../../lib/permissions'
import { isOverdue, OPEN_STATUSES } from '../../lib/status'
import { cx, uid } from '../../lib/util'
import { stamp } from '../../data/layer'
import type { LocationNode, LocationType } from '../../data/types'

export function StructurePage() {
  const { project, me, href, locations, locMap } = useProject()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(locations.filter(l => l.depth <= 1).map(l => l.id)))
  const [addOpen, setAddOpen] = useState(false)

  const defects = useLiveQuery(
    () => db.defects.where('project_id').equals(project.id).and(d => !d.archived_at).toArray(),
    [project.id],
  )

  const { openCount, overdueCount } = useMemo(() => {
    const openCount = new Map<string, number>()
    const overdueCount = new Map<string, number>()
    for (const d of defects ?? []) {
      const loc = locMap.get(d.location_id)
      if (!loc) continue
      const ids = loc.path.split('/').filter(Boolean)
      if (OPEN_STATUSES.includes(d.status)) ids.forEach(id => openCount.set(id, (openCount.get(id) ?? 0) + 1))
      if (isOverdue(d)) ids.forEach(id => overdueCount.set(id, (overdueCount.get(id) ?? 0) + 1))
    }
    return { openCount, overdueCount }
  }, [defects, locMap])

  const childrenOf = useMemo(() => {
    const m = new Map<string | null, LocationNode[]>()
    for (const l of locations) {
      const arr = m.get(l.parent_id) ?? []
      arr.push(l)
      m.set(l.parent_id, arr)
    }
    return m
  }, [locations])

  const selected = selectedId ? locMap.get(selectedId) : undefined
  const editAllowed = can(me, 'structure:edit')
  const plans = useLiveQuery(() => db.plans.where('project_id').equals(project.id).toArray(), [project.id])

  const toggle = (id: string) => setExpanded(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  function Tree({ parentId }: { parentId: string | null }) {
    const kids = childrenOf.get(parentId) ?? []
    return (
      <div className={parentId ? 'ms-4 border-s border-slate-200 dark:border-slate-700 ps-2' : ''}>
        {kids.map(node => {
          const hasKids = (childrenOf.get(node.id) ?? []).length > 0
          const open = openCount.get(node.id) ?? 0
          const over = overdueCount.get(node.id) ?? 0
          return (
            <div key={node.id}>
              <div className={cx('flex items-center gap-1.5 py-1.5 px-2 rounded-lg cursor-pointer text-sm',
                selectedId === node.id ? 'bg-brand/10 text-brand font-bold' : 'hover:bg-slate-50 dark:hover:bg-slate-800')}
                onClick={() => setSelectedId(node.id)}>
                <button onClick={e => { e.stopPropagation(); toggle(node.id) }}
                  className={cx('p-0.5 text-slate-400', !hasKids && 'invisible')}>
                  {expanded.has(node.id) ? <ChevronDown size={14} /> : <ChevronLeft size={14} />}
                </button>
                <span className="flex-1 truncate">{node.name}</span>
                {node.plan_id && <MapIcon size={12} className="text-brand/60" />}
                {over > 0 && <span className="w-2 h-2 rounded-full bg-st-open shrink-0" title={`${over} באיחור`} />}
                {open > 0 && <span className="text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 rounded-full px-1.5 py-0.5 ltr-num">{open}</span>}
              </div>
              {hasKids && expanded.has(node.id) && <Tree parentId={node.id} />}
            </div>
          )
        })}
      </div>
    )
  }

  if (locations.length === 0) {
    return (
      <div className="p-6">
        <EmptyState icon={<ListTree size={44} />} title="אין מבנה לפרויקט"
          hint="בנה את עץ המיקומים — אתר, בניין, קומות ויחידות"
          action={editAllowed ? <Btn variant="primary" onClick={() => setAddOpen(true)}><Plus size={15} /> צור צומת ראשון</Btn> : undefined} />
        <AddNodeDialog open={addOpen} onClose={() => setAddOpen(false)} parent={null} />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto grid md:grid-cols-[minmax(260px,340px)_1fr] gap-4 items-start">
      <Card className="p-3">
        <div className="flex items-center justify-between px-2 pb-2 border-b border-slate-100 dark:border-slate-800 mb-2">
          <h2 className="font-bold text-sm">עץ המיקומים</h2>
          <span className="text-[11px] text-slate-400 ltr-num">{locations.length} צמתים</span>
        </div>
        <div className="max-h-[65vh] overflow-y-auto">
          <Tree parentId={null} />
        </div>
      </Card>

      <Card className="p-4 min-h-40">
        {!selected ? (
          <div className="text-sm text-slate-400 py-8 text-center">בחר צומת מהעץ להצגת פרטים ופעולות</div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <div className="text-xs text-slate-400">{LOCATION_TYPE_LABEL[selected.type]}{selected.code && <span className="ltr-num"> · {selected.code}</span>}</div>
                <h2 className="text-lg font-extrabold">{selected.name}</h2>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Badge className="bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800">
                  {openCount.get(selected.id) ?? 0} ליקויים פתוחים
                </Badge>
                {(overdueCount.get(selected.id) ?? 0) > 0 && (
                  <Badge className="bg-st-open/10 text-st-open border-st-open/30">{overdueCount.get(selected.id)} באיחור</Badge>
                )}
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Link to={href(`defects?loc=${selected.id}`)}><Btn size="sm">הצג ליקויים כאן</Btn></Link>
              {can(me, 'defect:create') && (
                <Link to={href(`defects/new?loc=${selected.id}`)}><Btn size="sm" variant="primary"><Plus size={14} /> ליקוי חדש כאן</Btn></Link>
              )}
              {selected.plan_id && (
                <Link to={href(`plans/${selected.plan_id}?loc=${selected.id}`)}><Btn size="sm"><MapIcon size={14} /> פתח תוכנית</Btn></Link>
              )}
            </div>

            {editAllowed && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <div className="flex gap-2 flex-wrap">
                  <Btn size="sm" onClick={() => setAddOpen(true)}><Plus size={14} /> הוסף תת-מיקום</Btn>
                  <Btn size="sm" variant="ghost" className="text-st-open" onClick={async () => {
                    if (confirm(`לארכב את "${selected.name}" ואת כל מה שתחתיו?`)) {
                      const ids = locations.filter(l => l.path.startsWith(selected.path)).map(l => l.id)
                      for (const id of ids) await dl.archive('locations', id, me)
                      setSelectedId(null)
                    }
                  }}><Archive size={14} /> ארכב</Btn>
                </div>
                {selected.type === 'floor' && (plans?.length ?? 0) > 0 && (
                  <div className="max-w-xs">
                    <Label>תוכנית משויכת לקומה</Label>
                    <Select value={selected.plan_id ?? ''} onChange={async e => {
                      await dl.update<LocationNode>('locations', selected.id, { plan_id: e.target.value || null }, me)
                    }}>
                      <option value="">— ללא —</option>
                      {plans!.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </Select>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      <AddNodeDialog open={addOpen} onClose={() => setAddOpen(false)} parent={selected ?? null} />
    </div>
  )
}

function AddNodeDialog({ open, onClose, parent }: { open: boolean; onClose: () => void; parent: LocationNode | null }) {
  const { project, me, locations } = useProject()
  const [type, setType] = useState<LocationType>(parent ? 'floor' : 'site')
  const [name, setName] = useState('')
  const [count, setCount] = useState(1)

  async function save() {
    if (!name.trim()) return
    const siblings = locations.filter(l => l.parent_id === (parent?.id ?? null))
    let sort = siblings.reduce((m, s) => Math.max(m, s.sort_order), 0) + 1
    const rows: LocationNode[] = []
    for (let i = 1; i <= Math.max(1, count); i++) {
      const id = uid()
      const nm = count > 1 ? (name.includes('{n}') ? name.replace('{n}', String(i)) : `${name} ${i}`) : name.replace('{n}', '1')
      rows.push({
        id, ...stamp(me),
        project_id: project.id, parent_id: parent?.id ?? null, type,
        name: nm.trim(), sort_order: sort++,
        path: parent ? `${parent.path}/${id}` : `/${id}`,
        depth: parent ? parent.depth + 1 : 0,
        plan_id: null,
      })
    }
    await dl.bulkAdd('locations', rows, `add:${parent?.id ?? 'root'}`)
    onClose(); setName(''); setCount(1)
  }

  return (
    <Dialog open={open} onClose={onClose} title={parent ? `תת-מיקום חדש תחת "${parent.name}"` : 'צומת חדש'}>
      <div className="space-y-4">
        <div><Label>סוג</Label>
          <Select value={type} onChange={e => setType(e.target.value as LocationType)}>
            {Object.entries(LOCATION_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        <div><Label required>שם</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder='למשל: קומה {n} או "דירה"' />
          <p className="text-xs text-slate-400 mt-1">ביצירה מרובה: {'{n}'} יוחלף במספר רץ, או שיתווסף מספר אוטומטית.</p>
        </div>
        <div><Label>כמות</Label><Input type="number" min={1} max={50} value={count} onChange={e => setCount(+e.target.value || 1)} /></div>
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>ביטול</Btn>
          <Btn variant="primary" onClick={save} disabled={!name.trim()}>צור</Btn>
        </div>
      </div>
    </Dialog>
  )
}
