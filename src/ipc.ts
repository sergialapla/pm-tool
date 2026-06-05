import { ipcMain } from 'electron'
import { getDb } from './db'

// ── helpers ──────────────────────────────────────────────────────────────────

function parseJsonFields(row: Record<string, unknown>): Record<string, unknown> {
  const jsonKeys = ['monthly_expected', 'monthly_actual', 'monthly_hours', 'members']
  const out = { ...row }
  for (const key of jsonKeys) {
    if (typeof out[key] === 'string') {
      try { out[key] = JSON.parse(out[key] as string) } catch { out[key] = [] }
    }
  }
  return out
}

function serializeJsonFields(data: Record<string, unknown>): Record<string, unknown> {
  const jsonKeys = ['monthly_expected', 'monthly_actual', 'monthly_hours', 'members']
  const out = { ...data }
  for (const key of jsonKeys) {
    if (Array.isArray(out[key])) out[key] = JSON.stringify(out[key])
  }
  return out
}

// ── projects ──────────────────────────────────────────────────────────────────

ipcMain.handle('projects:list', () =>
  (getDb().prepare('SELECT * FROM projects').all() as Record<string, unknown>[]).map(parseJsonFields)
)

ipcMain.handle('projects:create', (_, data: Record<string, unknown>) => {
  const db = getDb()
  const result = db.prepare(`
    INSERT INTO projects (project_number, name, team_id, year, external_budget, internal_budget, additional_budget)
    VALUES (@project_number, @name, @team_id, @year, @external_budget, @internal_budget, @additional_budget)
  `).run(data)
  return { id: result.lastInsertRowid, ...data }
})

ipcMain.handle('projects:update', (_, { id, ...data }: Record<string, unknown>) => {
  const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
  getDb().prepare(`UPDATE projects SET ${fields} WHERE id = @id`).run({ id, ...data })
  return { id, ...data }
})

ipcMain.handle('projects:delete', (_, id: number) => {
  getDb().prepare('DELETE FROM projects WHERE id = ?').run(id)
  return { id }
})

// ── teams ─────────────────────────────────────────────────────────────────────

ipcMain.handle('teams:list', () =>
  (getDb().prepare('SELECT * FROM teams').all() as Record<string, unknown>[]).map(parseJsonFields)
)

ipcMain.handle('teams:create', (_, { name, members }: { name: string; members: string[] }) => {
  const result = getDb().prepare('INSERT INTO teams (name, members) VALUES (?, ?)').run(name, JSON.stringify(members || []))
  return { id: result.lastInsertRowid, name, members: members || [] }
})

ipcMain.handle('teams:update', (_, { id, name, members }: { id: number; name: string; members: string[] }) => {
  getDb().prepare('UPDATE teams SET name = ?, members = ? WHERE id = ?').run(name, JSON.stringify(members || []), id)
  return { id, name, members }
})

ipcMain.handle('teams:delete', (_, id: number) => {
  getDb().prepare('DELETE FROM teams WHERE id = ?').run(id)
  return { id }
})

// ── companies ─────────────────────────────────────────────────────────────────

ipcMain.handle('companies:list', () =>
  getDb().prepare('SELECT * FROM companies ORDER BY name').all()
)

ipcMain.handle('companies:create', (_, data: Record<string, unknown>) => {
  const result = getDb().prepare('INSERT INTO companies (name, country) VALUES (@name, @country)').run(data)
  return { id: result.lastInsertRowid, ...data }
})

ipcMain.handle('companies:update', (_, { id, name, country }: { id: number; name: string; country: string }) => {
  getDb().prepare('UPDATE companies SET name = ?, country = ? WHERE id = ?').run(name, country, id)
  return { id, name, country }
})

ipcMain.handle('companies:delete', (_, id: number) => {
  getDb().prepare('DELETE FROM companies WHERE id = ?').run(id)
  return { id }
})

// ── external resources ────────────────────────────────────────────────────────

ipcMain.handle('external:list', (_, projectId?: number) => {
  const rows = (projectId
    ? getDb().prepare('SELECT * FROM external_resources WHERE project_id = ?').all(projectId)
    : getDb().prepare('SELECT * FROM external_resources').all()) as Record<string, unknown>[]
  return rows.map(parseJsonFields)
})

ipcMain.handle('external:upsert', (_, raw: Record<string, unknown>) => {
  const { id, ...rest } = raw
  const data = serializeJsonFields(rest)
  const db = getDb()
  if (id) {
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE external_resources SET ${fields} WHERE id = @id`).run({ id, ...data })
    return { id, ...rest }
  }
  const cols = Object.keys(data).join(', ')
  const vals = Object.keys(data).map(k => `@${k}`).join(', ')
  const result = db.prepare(`INSERT INTO external_resources (${cols}) VALUES (${vals})`).run(data)
  return { id: result.lastInsertRowid, ...rest }
})

ipcMain.handle('external:delete', (_, id: number) => {
  getDb().prepare('DELETE FROM external_resources WHERE id = ?').run(id)
  return { id }
})

// ── internal resources ────────────────────────────────────────────────────────

ipcMain.handle('internal:list', (_, projectId?: number) => {
  const rows = (projectId
    ? getDb().prepare('SELECT * FROM internal_resources WHERE project_id = ?').all(projectId)
    : getDb().prepare('SELECT * FROM internal_resources').all()) as Record<string, unknown>[]
  return rows.map(parseJsonFields)
})

ipcMain.handle('internal:upsert', (_, raw: Record<string, unknown>) => {
  const { id, ...rest } = raw
  const data = serializeJsonFields(rest)
  const db = getDb()
  if (id) {
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE internal_resources SET ${fields} WHERE id = @id`).run({ id, ...data })
    return { id, ...rest }
  }
  const cols = Object.keys(data).join(', ')
  const vals = Object.keys(data).map(k => `@${k}`).join(', ')
  const result = db.prepare(`INSERT INTO internal_resources (${cols}) VALUES (${vals})`).run(data)
  return { id: result.lastInsertRowid, ...rest }
})

ipcMain.handle('internal:delete', (_, id: number) => {
  getDb().prepare('DELETE FROM internal_resources WHERE id = ?').run(id)
  return { id }
})

// ── other resources ───────────────────────────────────────────────────────────

ipcMain.handle('others:list', (_, projectId?: number) => {
  const rows = (projectId
    ? getDb().prepare('SELECT * FROM other_resources WHERE project_id = ?').all(projectId)
    : getDb().prepare('SELECT * FROM other_resources').all()) as Record<string, unknown>[]
  return rows.map(parseJsonFields)
})

ipcMain.handle('others:upsert', (_, raw: Record<string, unknown>) => {
  const { id, ...rest } = raw
  const data = serializeJsonFields(rest)
  const db = getDb()
  if (id) {
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE other_resources SET ${fields} WHERE id = @id`).run({ id, ...data })
    return { id, ...rest }
  }
  const cols = Object.keys(data).join(', ')
  const vals = Object.keys(data).map(k => `@${k}`).join(', ')
  const result = db.prepare(`INSERT INTO other_resources (${cols}) VALUES (${vals})`).run(data)
  return { id: result.lastInsertRowid, ...rest }
})

ipcMain.handle('others:delete', (_, id: number) => {
  getDb().prepare('DELETE FROM other_resources WHERE id = ?').run(id)
  return { id }
})

// ── settings ──────────────────────────────────────────────────────────────────

ipcMain.handle('settings:get', () => {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
})

ipcMain.handle('settings:set', (_, { key, value }: { key: string; value: string }) => {
  getDb().prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').run(key, String(value))
  return { key, value }
})

ipcMain.handle('settings:setDbPath', (_, path: string) => {
  const { initDb } = require('./db')
  initDb(path)
  return { path }
})
