import { ipcMain, dialog } from 'electron'
import { dbAll, dbRun, saveDb, initDb } from './db'

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
    if (v === undefined) continue
    out[k] = JSON_FIELDS.includes(k) && Array.isArray(v) ? JSON.stringify(v) : v
  }
  return out
}

function upsert(table: string, data: Record<string, unknown>): Record<string, unknown> {
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

// ── companies ─────────────────────────────────────────────────────────────────

ipcMain.handle('companies:list', () =>
  dbAll('SELECT * FROM companies ORDER BY name')
)
ipcMain.handle('companies:create', (_, d) => {
  const r = dbRun('INSERT INTO companies (name, country) VALUES (@name, @country)', d)
  saveDb()
  return { id: r.lastInsertRowid, ...d }
})
ipcMain.handle('companies:update', (_, { id, name, country }) => {
  dbRun('UPDATE companies SET name=@name, country=@country WHERE id=@id', { id, name, country })
  saveDb()
  return { id, name, country }
})
ipcMain.handle('companies:delete', (_, id) => {
  dbRun('DELETE FROM companies WHERE id=@id', { id })
  saveDb()
})

// ── teams ─────────────────────────────────────────────────────────────────────

ipcMain.handle('teams:list', () =>
  dbAll('SELECT * FROM teams').map(r => parse(r as Record<string, unknown>))
)
ipcMain.handle('teams:create', (_, { name, members }) => {
  const r = dbRun('INSERT INTO teams (name, members) VALUES (@name, @members)', {
    name,
    members: JSON.stringify(members || []),
  })
  saveDb()
  return { id: r.lastInsertRowid, name, members: members || [] }
})
ipcMain.handle('teams:update', (_, { id, name, members }) => {
  dbRun('UPDATE teams SET name=@name, members=@members WHERE id=@id', {
    id,
    name,
    members: JSON.stringify(members || []),
  })
  saveDb()
  return { id, name, members }
})
ipcMain.handle('teams:delete', (_, id) => {
  dbRun('DELETE FROM teams WHERE id=@id', { id })
  saveDb()
})

// ── projects ──────────────────────────────────────────────────────────────────

ipcMain.handle('projects:list', () =>
  dbAll('SELECT * FROM projects')
)
ipcMain.handle('projects:create', (_, d) => {
  const r = dbRun(`
    INSERT INTO projects (project_number,name,team_id,year,external_budget,internal_budget,additional_budget)
    VALUES (@project_number,@name,@team_id,@year,@external_budget,@internal_budget,@additional_budget)
  `, d)
  saveDb()
  return { id: r.lastInsertRowid, ...d }
})
ipcMain.handle('projects:update', (_, { id, ...d }) => {
  const fields = Object.keys(d).map(k => `${k}=@${k}`).join(',')
  dbRun(`UPDATE projects SET ${fields} WHERE id=@id`, { id, ...d })
  saveDb()
  return { id, ...d }
})
ipcMain.handle('projects:delete', (_, id) => {
  dbRun('DELETE FROM projects WHERE id=@id', { id })
  saveDb()
})

// ── external resources (legacy — kept for backward compatibility) ─────────────

ipcMain.handle('external:list', (_, pid?) =>
  (pid
    ? dbAll('SELECT * FROM external_resources WHERE project_id=@pid', { pid })
    : dbAll('SELECT * FROM external_resources')
  ).map(r => parse(r as Record<string, unknown>))
)
ipcMain.handle('external:upsert', (_, d) => upsert('external_resources', d))
ipcMain.handle('external:delete', (_, id) => {
  dbRun('DELETE FROM external_resources WHERE id=@id', { id })
  saveDb()
})

// ── external people ───────────────────────────────────────────────────────────

ipcMain.handle('ext-people:list', () =>
  dbAll('SELECT * FROM external_people ORDER BY name')
)
ipcMain.handle('ext-people:upsert', (_, d) => upsert('external_people', d))
ipcMain.handle('ext-people:delete', (_, id) => {
  dbRun('DELETE FROM external_people WHERE id=@id', { id })
  saveDb()
})

// ── external POs ─────────────────────────────────────────────────────────────

ipcMain.handle('ext-pos:list', (_, personId?) =>
  (personId
    ? dbAll('SELECT * FROM external_pos WHERE person_id=@personId', { personId })
    : dbAll('SELECT * FROM external_pos')
  ).map(r => parse(r as Record<string, unknown>))
)
ipcMain.handle('ext-pos:upsert', (_, d) => upsert('external_pos', d))
ipcMain.handle('ext-pos:delete', (_, id) => {
  dbRun('DELETE FROM external_pos WHERE id=@id', { id })
  saveDb()
})

// ── internal people ───────────────────────────────────────────────────────────

ipcMain.handle('people:list', () =>
  dbAll('SELECT * FROM internal_people ORDER BY name')
)
ipcMain.handle('people:upsert', (_, d) => upsert('internal_people', d))
ipcMain.handle('people:delete', (_, id) => {
  dbRun('DELETE FROM internal_people WHERE id=@id', { id })
  saveDb()
})

// ── internal allocations ──────────────────────────────────────────────────────

ipcMain.handle('allocations:list', (_, pid?) =>
  (pid
    ? dbAll('SELECT * FROM internal_allocations WHERE project_id=@pid', { pid })
    : dbAll('SELECT * FROM internal_allocations')
  ).map(r => parse(r as Record<string, unknown>))
)
ipcMain.handle('allocations:upsert', (_, d) => upsert('internal_allocations', d))
ipcMain.handle('allocations:delete', (_, id) => {
  dbRun('DELETE FROM internal_allocations WHERE id=@id', { id })
  saveDb()
})

// ── other resources ───────────────────────────────────────────────────────────

ipcMain.handle('others:list', (_, pid?) =>
  (pid
    ? dbAll('SELECT * FROM other_resources WHERE project_id=@pid', { pid })
    : dbAll('SELECT * FROM other_resources')
  ).map(r => parse(r as Record<string, unknown>))
)
ipcMain.handle('others:upsert', (_, d) => upsert('other_resources', d))
ipcMain.handle('others:delete', (_, id) => {
  dbRun('DELETE FROM other_resources WHERE id=@id', { id })
  saveDb()
})

// ── settings ──────────────────────────────────────────────────────────────────

ipcMain.handle('settings:get', () => {
  const rows = dbAll<{ key: string; value: string }>('SELECT key,value FROM settings')
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
})
ipcMain.handle('settings:set', (_, { key, value }) => {
  dbRun('INSERT OR REPLACE INTO settings(key,value) VALUES(@key,@value)', {
    key,
    value: String(value),
  })
  saveDb()
})
ipcMain.handle('settings:setDbPath', async (_, path: string) => {
  await initDb(path)
})

// ── dialog ────────────────────────────────────────────────────────────────────

ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite'] }],
  })
  return result.canceled ? null : result.filePaths[0]
})
