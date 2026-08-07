import Dexie, { type Table } from 'dexie'
import type {
  ActivityRow, Attachment, BlobRow, CommentRow, Company, DailyLog, Defect,
  LocationNode, MetaRow, NotificationRow, OutboxRow, Plan, PlanVersion,
  Project, ProjectMember, Task, User,
} from './types'

class BuildFlowDB extends Dexie {
  companies!: Table<Company, string>
  users!: Table<User, string>
  projects!: Table<Project, string>
  members!: Table<ProjectMember, string>
  locations!: Table<LocationNode, string>
  plans!: Table<Plan, string>
  plan_versions!: Table<PlanVersion, string>
  defects!: Table<Defect, string>
  tasks!: Table<Task, string>
  attachments!: Table<Attachment, string>
  comments!: Table<CommentRow, string>
  activity!: Table<ActivityRow, string>
  daily_logs!: Table<DailyLog, string>
  notifications!: Table<NotificationRow, string>
  outbox!: Table<OutboxRow, number>
  blobs!: Table<BlobRow, string>
  meta!: Table<MetaRow, string>

  constructor() {
    super('buildflow')
    this.version(1).stores({
      companies: 'id, type',
      users: 'id, company_id, role',
      projects: 'id, status',
      members: 'id, project_id, user_id',
      locations: 'id, project_id, parent_id',
      plans: 'id, project_id',
      plan_versions: 'id, plan_id',
      defects: 'id, project_id, location_id, status, assigned_company_id',
      tasks: 'id, project_id, status',
      attachments: 'id, project_id, entity_id, [entity_type+entity_id]',
      comments: 'id, entity_id, [entity_type+entity_id]',
      activity: 'id, project_id, entity_id, [entity_type+entity_id], at',
      daily_logs: 'id, project_id, date',
      notifications: 'id, user_id, created_at',
      outbox: '++seq, status',
      blobs: 'id',
      meta: 'key',
    })
  }
}

export const db = new BuildFlowDB()
