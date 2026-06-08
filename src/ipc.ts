import { ipcMain, dialog } from 'electron'
import { getDb, initDb } from './db'

// ── helpers ───────────────────────────────────────────────────────────────────

const JSON_FIELDS = ['monthly_expected', 'monthly_actual', 'monthly_hours', 'members']

function parse(row: Record<string, unknown>): Record<string, unknown> {
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
    if (v === undefined) continue  // omit undefined — INSERT uses DB default, UPDATE keeps existing value
    out[k] = JSON_FIELDS.includes(k) && Array.isArray(v) ? JSON.stringify(v) : v
  }
  return out
}

function upsert(table: string, data: Record<string, unknown>): Record<string, unknown> {
  const { id, ...rest } = data
  const payload = serialize(rest)
  const db = getDb()
  if (id) {
    const fields = Object.keys(payload).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE ${table} SET ${fields} WHERE id = @id`).run({ id, ...payload })
    return { id, ...rest }
  }
  const cols = Object.keys(payload).join(', ')
  const vals = Object.keys(payload).map(k => `@${k}`).join(', ')
  const result = db.prepare(`INSERT INTO ${table} (${cols}) VALUES (${vals})`).run(payload)
  return { id: result.lastInsertRowid, ...rest }
}

// ── companies ─────────────────────────────────────────────────────────────────

ipcMain.handle('companies:list', () =>
  getDb().prepare('SELECT * FROM companies ORDER BY name').all()
)
ipcMain.handle('companies:create', (_, d) => {
  const r = getDb().prepare('INSERT INTO companies (name, country) VALUES (@name, @country)').run(d)
  return { id: r.lastInsertRowid, ...d }
})
ipcMain.handle('companies:update', (_, { id, name, country }) => {
  getDb().prepare('UPDATE companies SET name=?, country=? WHERE id=?').run(name, country, id)
  return { id, name, country }
})
ipcMain.handle('companies:delete', (_, id) => {
  getDb().prepare('DELETE FROM companies WHERE id=?').run(id)
})

// ── teams ─────────────────────────────────────────────────────────────────────

ipcMain.handle('teams:list', () =>
  (getDb().prepare('SELECT * FROM teams').all() as Record<string, unknown>[]).map(parse)
)
ipcMain.handle('teams:create', (_, { name, members }) => {
  const r = getDb().prepare('INSERT INTO teams (name, members) VALUES (?,?)').run(name, JSON.stringify(members || []))
  return { id: r.lastInsertRowid, name, members: members || [] }
})
ipcMain.handle('teams:update', (_, { id, name, members }) => {
  getDb().prepare('UPDATE teams SET name=?, members=? WHERE id=?').run(name, JSON.stringify(members || []), id)
  return { id, name, members }
})
ipcMain.handle('teams:delete', (_, id) => {
  getDb().prepare('DELETE FROM teams WHERE id=?').run(id)
})

// ── projects ──────────────────────────────────────────────────────────────────

ipcMain.handle('projects:list', () =>
  getDb().prepare('SELECT * FROM projects').all()
)
ipcMain.handle('projects:create', (_, d) => {
  const r = getDb().prepare(`
    INSERT INTO projects (project_number,name,team_id,year,external_budget,internal_budget,additional_budget)
    VALUES (@project_number,@name,@team_id,@year,@external_budget,@internal_budget,@additional_budget)
  `).run(d)
  return { id: r.lastInsertRowid, ...d }
})
ipcMain.handle('projects:update', (_, { id, ...d }) => {
  const fields = Object.keys(d).map(k => `${k}=@${k}`).join(',')
  getDb().prepare(`UPDATE projects SET ${fields} WHERE id=@id`).run({ id, ...d })
  return { id, ...d }
})
ipcMain.handle('projects:delete', (_, id) => {
  getDb().prepare('DELETE FROM projects WHERE id=?').run(id)
})

// ── external resources (legacy — kept for backward compatibility) ─────────────

ipcMain.handle('external:list', (_, pid?) =>
  (pid
    ? getDb().prepare('SELECT * FROM external_resources WHERE project_id=?').all(pid)
    : getDb().prepare('SELECT * FROM external_resources').all()
  ).map(r => parse(r as Record<string, unknown>))
)
ipcMain.handle('external:upsert', (_, d) => upsert('external_resources', d))
ipcMain.handle('external:delete', (_, id) => {
  getDb().prepare('DELETE FROM external_resources WHERE id=?').run(id)
})

// ── external people ───────────────────────────────────────────────────────────

ipcMain.handle('ext-people:list', () =>
  getDb().prepare('SELECT * FROM external_people ORDER BY name').all()
)
ipcMain.handle('ext-people:upsert', (_, d) => upsert('external_people', d))
ipcMain.handle('ext-people:delete', (_, id) => {
  getDb().prepare('DELETE FROM external_people WHERE id=?').run(id)
})

// ── external POs ─────────────────────────────────────────────────────────────

ipcMain.handle('ext-pos:list', (_, personId?) =>
  (personId
    ? getDb().prepare('SELECT * FROM external_pos WHERE person_id=?').all(personId)
    : getDb().prepare('SELECT * FROM external_pos').all()
  ).map(r => parse(r as Record<string, unknown>))
)
ipcMain.handle('ext-pos:upsert', (_, d) => upsert('external_pos', d))
ipcMain.handle('ext-pos:delete', (_, id) => {
  getDb().prepare('DELETE FROM external_pos WHERE id=?').run(id)
})

// ── internal people ───────────────────────────────────────────────────────────

ipcMain.handle('people:list', () =>
  getDb().prepare('SELECT * FROM internal_people ORDER BY name').all()
)
ipcMain.handle('people:upsert', (_, d) => upsert('internal_people', d))
ipcMain.handle('people:delete', (_, id) => {
  getDb().prepare('DELETE FROM internal_people WHERE id=?').run(id)
})

// ── internal allocations ──────────────────────────────────────────────────────

ipcMain.handle('allocations:list', (_, pid?) =>
  (pid
    ? getDb().prepare('SELECT * FROM internal_allocations WHERE project_id=?').all(pid)
    : getDb().prepare('SELECT * FROM internal_allocations').all()
  ).map(r => parse(r as Record<string, unknown>))
)
ipcMain.handle('allocations:upsert', (_, d) => upsert('internal_allocations', d))
ipcMain.handle('allocations:delete', (_, id) => {
  getDb().prepare('DELETE FROM internal_allocations WHERE id=?').run(id)
})

// ── other resources ───────────────────────────────────────────────────────────

ipcMain.handle('others:list', (_, pid?) =>
  (pid
    ? getDb().prepare('SELECT * FROM other_resources WHERE project_id=?').all(pid)
    : getDb().prepare('SELECT * FROM other_resources').all()
  ).map(r => parse(r as Record<string, unknown>))
)
ipcMain.handle('others:upsert', (_, d) => upsert('other_resources', d))
ipcMain.handle('others:delete', (_, id) => {
  getDb().prepare('DELETE FROM other_resources WHERE id=?').run(id)
})

// ── settings ──────────────────────────────────────────────────────────────────

ipcMain.handle('settings:get', () => {
  const rows = getDb().prepare('SELECT key,value FROM settings').all() as { key: string; value: string }[]
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
})
ipcMain.handle('settings:set', (_, { key, value }) => {
  getDb().prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').run(key, String(value))
})
ipcMain.handle('settings:setDbPath', (_, path: string) => {
  initDb(path)
})

// ── dialog ────────────────────────────────────────────────────────────────────

ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite'] }]
  })
  return result.canceled ? null : result.filePaths[0]
})
