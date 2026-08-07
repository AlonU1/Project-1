import { dl, stamp } from '../../data/layer'
import { uid } from '../../lib/util'
import type { LocationNode, LocationType, User } from '../../data/types'

// יצירת מבנה פרויקט מתבנית — SPEC §6.2–6.3

export interface StructureParams {
  template: 'residential' | 'office' | 'infrastructure' | 'empty'
  siteName: string
  buildingName: string
  floorFrom: number
  floorTo: number
  unitsPerFloor: number
  spaces: string[]
}

export const RESIDENTIAL_SPACES = ['סלון', 'מטבח', 'ממ"ד', 'חדר רחצה', 'מרפסת']
export const OFFICE_SPACES = ['אולם עבודה', 'חדר ישיבות', 'מטבחון', 'שירותים']

export async function generateStructure(projectId: string, params: StructureParams, user: User): Promise<void> {
  const rows: LocationNode[] = []
  let sort = 0

  const mk = (parent: LocationNode | null, type: LocationType, name: string, code?: string): LocationNode => {
    const id = uid()
    const node: LocationNode = {
      id, ...stamp(user),
      project_id: projectId, parent_id: parent?.id ?? null,
      type, name, code, sort_order: sort++,
      path: parent ? `${parent.path}/${id}` : `/${id}`,
      depth: parent ? parent.depth + 1 : 0,
      plan_id: null,
    }
    rows.push(node)
    return node
  }

  if (params.template === 'empty') {
    mk(null, 'site', params.siteName || 'אתר')
  } else if (params.template === 'infrastructure') {
    const site = mk(null, 'site', params.siteName || 'הפרויקט')
    for (let s = 1; s <= Math.max(1, params.floorTo); s++) {
      const section = mk(site, 'section', `קטע ${s}`, `S${s}`)
      for (let g = 1; g <= Math.max(1, params.unitsPerFloor); g++) {
        mk(section, 'segment', `מקטע ${s}.${g}`)
      }
    }
  } else {
    const unitLabel = params.template === 'office' ? 'אגף' : 'דירה'
    const unitType: LocationType = params.template === 'office' ? 'wing' : 'unit'
    const site = mk(null, 'site', params.siteName || 'האתר')
    const bldg = mk(site, 'building', params.buildingName || 'בניין A', 'A')
    for (let f = params.floorFrom; f <= params.floorTo; f++) {
      const floor = mk(bldg, 'floor', f === 0 ? 'קומת קרקע' : `קומה ${f}`, `F${f}`)
      for (let u = 1; u <= params.unitsPerFloor; u++) {
        const unit = mk(floor, unitType, `${unitLabel} ${u}`, `F${f}-U${u}`)
        params.spaces.forEach(s => mk(unit, 'space', s))
      }
    }
  }

  await dl.bulkAdd('locations', rows, `structure:${projectId}`)
}
