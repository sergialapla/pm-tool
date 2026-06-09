import { dbAll, dbRun, saveDb, initDb } from './db'

const JSON_FIELDS = ['monthly_expected', 'monthly_actual', 'monthly_hours', 'members']

export function parse(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row }
  for (const k of JSON_FIELDS) {
    if (typeof out[k] === 'string') {
      try { out[k] = JSON.parse(out[k] as string) } catch { out[k] = [] }
    }
  }
  return out
}

function serialize(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (k === 'id') continue
    if (v === undefined) continue
    out[k] = JSON_FIELDS.includes(k) && Array.isArray(v) ? JSON.stringify(v) : v
  }
  return out
}

export function upsert(table: string, data: Record<string, unknown>): Record<string, unknown> {
  const { id, ...rest } = data
  const payload = serialize(rest)
  if (id) {
    const fields = Object.keys(payload).map(k => `${k} = @${k}`).join(', ')
    dbRun(`UPDATE ${table} SET ${fields} WHERE id = @id`, { id, ...payload } as Record<string, unknown>)
    saveDb()
    return { id, ...rest }
  }
  const cols = Object.keys(payload).join(', ')
  const vals = Object.keys(payload).map(k => `@${k}`).join(', ')
  const result = dbRun(`INSERT INTO ${table} (${cols}) VALUES (${vals})`, payload)
  saveDb()
  return { id: result.lastInsertRowid, ...rest }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Args = any[]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const HANDLERS: Record<string, (args: Args) => unknown | Promise<unknown>> = {
  // ── companies ──────────────────────────────────────────────────────────────
  'companies:list': () => dbAll('SELECT * FROM companies ORDER BY name'),
  'companies:create': ([d]: [Record<string, unknown>]) => {
    const r = dbRun('INSERT INTO companies (name, country) VALUES (@name, @country)', d)
    saveDb()
    return { id: r.lastInsertRowid, ...d }
  },
  'companies:update': ([{ id, name, country }]) => {
    dbRun('UPDATE companies SET name=@name, country=@country WHERE id=@id', { id, name, country })
    saveDb()
    return { id, name, country }
  },
  'companies:delete': ([id]) => {
    dbRun('DELETE FROM companies WHERE id=@id', { id })
    saveDb()
  },

  // ── teams ──────────────────────────────────────────────────────────────────
  'teams:list': () => dbAll('SELECT * FROM teams').map(r => parse(r as Record<string, unknown>)),
  'teams:create': ([{ name, members }]) => {
    const r = dbRun('INSERT INTO teams (name, members) VALUES (@name, @members)', {
      name, members: JSON.stringify(members || []),
    })
    saveDb()
    return { id: r.lastInsertRowid, name, members: members || [] }
  },
  'teams:update': ([{ id, name, members }]) => {
    dbRun('UPDATE teams SET name=@name, members=@members WHERE id=@id', {
      id, name, members: JSON.stringify(members || []),
    })
    saveDb()
    return { id, name, members }
  },
  'teams:delete': ([id]) => {
    dbRun('DELETE FROM teams WHERE id=@id', { id })
    saveDb()
  },

  // ── projects ───────────────────────────────────────────────────────────────
  'projects:list': () => dbAll('SELECT * FROM projects'),
  'projects:create': ([d]) => {
    const r = dbRun(`
      INSERT INTO projects (project_number,name,team_id,year,external_budget,internal_budget,additional_budget)
      VALUES (@project_number,@name,@team_id,@year,@external_budget,@internal_budget,@additional_budget)
    `, d)
    saveDb()
    return { id: r.lastInsertRowid, ...d }
  },
  'projects:update': ([{ id, ...d }]) => {
    const fields = Object.keys(d).map(k => `${k}=@${k}`).join(',')
    dbRun(`UPDATE projects SET ${fields} WHERE id=@id`, { id, ...d })
    saveDb()
    return { id, ...d }
  },
  'projects:delete': ([id]) => {
    dbRun('DELETE FROM projects WHERE id=@id', { id })
    saveDb()
  },

  // ── external resources (legacy) ────────────────────────────────────────────
  'external:list': ([pid]) =>
    (pid
      ? dbAll('SELECT * FROM external_resources WHERE project_id=@pid', { pid })
      : dbAll('SELECT * FROM external_resources')
    ).map(r => parse(r as Record<string, unknown>)),
  'external:upsert': ([d]) => upsert('external_resources', d),
  'external:delete': ([id]) => {
    dbRun('DELETE FROM external_resources WHERE id=@id', { id })
    saveDb()
  },

  // ── external people ────────────────────────────────────────────────────────
  'ext-people:list': () => dbAll('SELECT * FROM external_people ORDER BY name'),
  'ext-people:upsert': ([d]) => upsert('external_people', d),
  'ext-people:delete': ([id]) => {
    dbRun('DELETE FROM external_people WHERE id=@id', { id })
    saveDb()
  },

  // ── external POs ───────────────────────────────────────────────────────────
  'ext-pos:list': ([personId]) =>
    (personId
      ? dbAll('SELECT * FROM external_pos WHERE person_id=@personId', { personId })
      : dbAll('SELECT * FROM external_pos')
    ).map(r => parse(r as Record<string, unknown>)),
  'ext-pos:upsert': ([d]) => upsert('external_pos', d),
  'ext-pos:delete': ([id]) => {
    dbRun('DELETE FROM external_pos WHERE id=@id', { id })
    saveDb()
  },

  // ── internal people ────────────────────────────────────────────────────────
  'people:list': () => dbAll('SELECT * FROM internal_people ORDER BY name'),
  'people:upsert': ([d]) => upsert('internal_people', d),
  'people:delete': ([id]) => {
    dbRun('DELETE FROM internal_people WHERE id=@id', { id })
    saveDb()
  },

  // ── internal allocations ───────────────────────────────────────────────────
  'allocations:list': ([pid]) =>
    (pid
      ? dbAll('SELECT * FROM internal_allocations WHERE project_id=@pid', { pid })
      : dbAll('SELECT * FROM internal_allocations')
    ).map(r => parse(r as Record<string, unknown>)),
  'allocations:upsert': ([d]) => upsert('internal_allocations', d),
  'allocations:delete': ([id]) => {
    dbRun('DELETE FROM internal_allocations WHERE id=@id', { id })
    saveDb()
  },

  // ── other resources ────────────────────────────────────────────────────────
  'others:list': ([pid]) =>
    (pid
      ? dbAll('SELECT * FROM other_resources WHERE project_id=@pid', { pid })
      : dbAll('SELECT * FROM other_resources')
    ).map(r => parse(r as Record<string, unknown>)),
  'others:upsert': ([d]) => upsert('other_resources', d),
  'others:delete': ([id]) => {
    dbRun('DELETE FROM other_resources WHERE id=@id', { id })
    saveDb()
  },

  // ── settings ───────────────────────────────────────────────────────────────
  'settings:get': () => {
    const rows = dbAll<{ key: string; value: string }>('SELECT key,value FROM settings')
    return Object.fromEntries(rows.map(r => [r.key, r.value]))
  },
  'settings:set': ([{ key, value }]) => {
    dbRun('INSERT OR REPLACE INTO settings(key,value) VALUES(@key,@value)', {
      key, value: String(value),
    })
    saveDb()
  },
  'settings:setDbPath': async ([path]: [string]) => {
    await initDb(path)
  },

  // dialog:openFile not available in web/server mode — return null
  'dialog:openFile': () => null,
}

export async function dispatch(channel: string, args: Args): Promise<unknown> {
  const handler = HANDLERS[channel]
  if (!handler) throw new Error(`Unknown IPC channel: ${channel}`)
  return handler(args)
}
