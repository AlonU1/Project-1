import { createContext, useContext } from 'react'
import type { Company, LocationNode, Project, User } from '../../data/types'

export interface ProjectCtxValue {
  project: Project
  me: User
  users: User[]
  userMap: Map<string, User>
  companies: Company[]
  companyMap: Map<string, Company>
  contractors: Company[]
  locations: LocationNode[]
  locMap: Map<string, LocationNode>
  /** נתיב יחסי בתוך הפרויקט → נתיב מלא */
  href: (path: string) => string
  /** "בניין A › קומה 3 › דירה 2" */
  locName: (locationId?: string | null) => string
}

export const ProjectCtx = createContext<ProjectCtxValue | null>(null)

export function useProject(): ProjectCtxValue {
  const v = useContext(ProjectCtx)
  if (!v) throw new Error('useProject outside ProjectLayout')
  return v
}

export function buildLocName(locMap: Map<string, LocationNode>) {
  return (locationId?: string | null): string => {
    if (!locationId) return '—'
    const parts: string[] = []
    let cur = locMap.get(locationId)
    while (cur) {
      if (cur.type !== 'site') parts.unshift(cur.name)
      cur = cur.parent_id ? locMap.get(cur.parent_id) : undefined
    }
    return parts.length ? parts.join(' › ') : '—'
  }
}
