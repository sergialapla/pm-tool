import type {
  Company, Team, Project,
  ExternalResource, ExternalPerson, ExternalPO,
  InternalPerson, InternalAllocation, OtherResource,
  AppSettings
} from '../types'

const inv = (ch: string, ...a: unknown[]) => window.api.invoke(ch, ...a)

export const api = {
  companies: {
    list: () => inv('companies:list') as Promise<Company[]>,
    create: (d: Omit<Company,'id'>) => inv('companies:create', d) as Promise<Company>,
    update: (d: Company) => inv('companies:update', d) as Promise<Company>,
    delete: (id: number) => inv('companies:delete', id) as Promise<void>,
  },
  teams: {
    list: () => inv('teams:list') as Promise<Team[]>,
    create: (d: Omit<Team,'id'>) => inv('teams:create', d) as Promise<Team>,
    update: (d: Team) => inv('teams:update', d) as Promise<Team>,
    delete: (id: number) => inv('teams:delete', id) as Promise<void>,
  },
  projects: {
    list: () => inv('projects:list') as Promise<Project[]>,
    create: (d: Omit<Project,'id'>) => inv('projects:create', d) as Promise<Project>,
    update: (d: Project) => inv('projects:update', d) as Promise<Project>,
    delete: (id: number) => inv('projects:delete', id) as Promise<void>,
  },
  external: {
    list: (pid?: number) => inv('external:list', pid) as Promise<ExternalResource[]>,
    upsert: (d: ExternalResource) => inv('external:upsert', d) as Promise<ExternalResource>,
    delete: (id: number) => inv('external:delete', id) as Promise<void>,
  },
  extPeople: {
    list: () => inv('ext-people:list') as Promise<ExternalPerson[]>,
    upsert: (d: ExternalPerson) => inv('ext-people:upsert', d) as Promise<ExternalPerson>,
    delete: (id: number) => inv('ext-people:delete', id) as Promise<void>,
  },
  extPos: {
    list: (personId?: number) => inv('ext-pos:list', personId) as Promise<ExternalPO[]>,
    upsert: (d: ExternalPO) => inv('ext-pos:upsert', d) as Promise<ExternalPO>,
    delete: (id: number) => inv('ext-pos:delete', id) as Promise<void>,
  },
  people: {
    list: () => inv('people:list') as Promise<InternalPerson[]>,
    upsert: (d: InternalPerson) => inv('people:upsert', d) as Promise<InternalPerson>,
    delete: (id: number) => inv('people:delete', id) as Promise<void>,
  },
  allocations: {
    list: (pid?: number) => inv('allocations:list', pid) as Promise<InternalAllocation[]>,
    upsert: (d: InternalAllocation) => inv('allocations:upsert', d) as Promise<InternalAllocation>,
    delete: (id: number) => inv('allocations:delete', id) as Promise<void>,
  },
  others: {
    list: (pid?: number) => inv('others:list', pid) as Promise<OtherResource[]>,
    upsert: (d: OtherResource) => inv('others:upsert', d) as Promise<OtherResource>,
    delete: (id: number) => inv('others:delete', id) as Promise<void>,
  },
  settings: {
    get: () => inv('settings:get') as Promise<AppSettings>,
    set: (key: string, value: string) => inv('settings:set', { key, value }) as Promise<void>,
    setDbPath: (path: string) => inv('settings:setDbPath', path) as Promise<void>,
  },
  dialog: {
    openFile: () => inv('dialog:openFile') as Promise<string | null>,
  },
}
