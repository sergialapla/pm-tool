import initSqlJs from 'sql.js'
import type { Database } from 'sql.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

type BindParam = string | number | null | Uint8Array
type Params = BindParam[] | Record<string, BindParam>

let db: Database
let currentDbPath: string

function normalizeParams(params: Params): BindParam[] | Record<string, BindParam> {
  if (Array.isArray(params)) return params
  const out: Record<string, BindParam> = {}
  for (const [k, v] of Object.entries(params)) {
    const key = k.startsWith('@') || k.startsWith(':') || k.startsWith('$') ? k : `@${k}`
    out[key] = v as BindParam
  }
  return out
}

export function dbAll<T = Record<string, unknown>>(sql: string, params?: Params): T[] {
  const stmt = db.prepare(sql)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (params !== undefined) stmt.bind(normalizeParams(params) as any)
  const rows: T[] = []
  while (stmt.step()) rows.push(stmt.getAsObject() as unknown as T)
  stmt.free()
  return rows
}

export function dbGet<T = Record<string, unknown>>(sql: string, params?: Params): T | null {
  const stmt = db.prepare(sql)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (params !== undefined) stmt.bind(normalizeParams(params) as any)
  const row = stmt.step() ? (stmt.getAsObject() as unknown as T) : null
  stmt.free()
  return row
}

export function dbRun(sql: string, params?: Params): { lastInsertRowid: number } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.run(sql, params !== undefined ? (normalizeParams(params) as any) : undefined)
  const result = db.exec('SELECT last_insert_rowid()')[0]
  return { lastInsertRowid: Number(result.values[0][0]) }
}

export function dbExec(sql: string): void {
  db.exec(sql)
}

export function saveDb(): void {
  const data = db.export()
  writeFileSync(currentDbPath, Buffer.from(data))
}

const EXT_SCHEMA = `
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id       INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  team_id          INTEGER REFERENCES teams(id),
  company_id       INTEGER REFERENCES companies(id),
  name             TEXT NOT NULL,
  position         TEXT NOT NULL DEFAULT '',
  rate_type        TEXT NOT NULL CHECK(rate_type IN ('month','hour','fixed')),
  rate             REAL NOT NULL DEFAULT 0,
  pr_number        TEXT NOT NULL DEFAULT '',
  po_number        TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','open','complete')),
  country          TEXT NOT NULL DEFAULT '',
  allocation       REAL NOT NULL DEFAULT 100,
  month_start      INTEGER NOT NULL DEFAULT 1,
  month_end        INTEGER NOT NULL DEFAULT 12,
  total_po         REAL NOT NULL DEFAULT 0,
  comments         TEXT NOT NULL DEFAULT '',
  monthly_hours    TEXT NOT NULL DEFAULT '[0,0,0,0,0,0,0,0,0,0,0,0]',
  monthly_expected TEXT NOT NULL DEFAULT '[0,0,0,0,0,0,0,0,0,0,0,0]',
  monthly_actual   TEXT NOT NULL DEFAULT '[0,0,0,0,0,0,0,0,0,0,0,0]'
`

function runMigrations(): void {
  dbExec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS companies (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      name    TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS teams (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      name    TEXT NOT NULL,
      members TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS projects (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      project_number    TEXT NOT NULL,
      name              TEXT NOT NULL,
      team_id           INTEGER REFERENCES teams(id),
      year              INTEGER NOT NULL,
      external_budget   REAL NOT NULL DEFAULT 0,
      internal_budget   REAL NOT NULL DEFAULT 0,
      additional_budget REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS external_resources (${EXT_SCHEMA});

    CREATE TABLE IF NOT EXISTS internal_resources (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      team_id        INTEGER REFERENCES teams(id),
      name           TEXT NOT NULL,
      price_per_hour REAL NOT NULL DEFAULT 0,
      monthly_hours  TEXT NOT NULL DEFAULT '[0,0,0,0,0,0,0,0,0,0,0,0]',
      monthly_actual TEXT NOT NULL DEFAULT '[0,0,0,0,0,0,0,0,0,0,0,0]'
    );

    CREATE TABLE IF NOT EXISTS internal_people (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT NOT NULL,
      price_per_hour REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS internal_allocations (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id      INTEGER NOT NULL REFERENCES internal_people(id) ON DELETE CASCADE,
      project_id     INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      team_id        INTEGER REFERENCES teams(id),
      dedication_pct REAL NOT NULL DEFAULT 100,
      monthly_hours  TEXT NOT NULL DEFAULT '[0,0,0,0,0,0,0,0,0,0,0,0]',
      monthly_actual TEXT NOT NULL DEFAULT '[0,0,0,0,0,0,0,0,0,0,0,0]'
    );

    CREATE TABLE IF NOT EXISTS other_resources (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      team_id          INTEGER REFERENCES teams(id),
      company_id       INTEGER REFERENCES companies(id),
      pr_number        TEXT NOT NULL DEFAULT '',
      po_number        TEXT NOT NULL DEFAULT '',
      description      TEXT NOT NULL DEFAULT '',
      status           TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','open','complete')),
      monthly_expected TEXT NOT NULL DEFAULT '[0,0,0,0,0,0,0,0,0,0,0,0]',
      monthly_actual   TEXT NOT NULL DEFAULT '[0,0,0,0,0,0,0,0,0,0,0,0]'
    );

    CREATE TABLE IF NOT EXISTS external_people (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      company_id INTEGER REFERENCES companies(id),
      position   TEXT NOT NULL DEFAULT '',
      country    TEXT NOT NULL DEFAULT '',
      rate_type  TEXT NOT NULL DEFAULT 'month' CHECK(rate_type IN ('month','hour','fixed')),
      rate       REAL NOT NULL DEFAULT 0,
      allocation REAL NOT NULL DEFAULT 100
    );

    CREATE TABLE IF NOT EXISTS external_pos (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id        INTEGER NOT NULL REFERENCES external_people(id) ON DELETE CASCADE,
      project_id       INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      team_id          INTEGER REFERENCES teams(id),
      pr_number        TEXT NOT NULL DEFAULT '',
      po_number        TEXT NOT NULL DEFAULT '',
      status           TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','open','complete')),
      month_start      INTEGER NOT NULL DEFAULT 1,
      month_end        INTEGER NOT NULL DEFAULT 12,
      total_po         REAL NOT NULL DEFAULT 0,
      comments         TEXT NOT NULL DEFAULT '',
      monthly_hours    TEXT NOT NULL DEFAULT '[0,0,0,0,0,0,0,0,0,0,0,0]',
      monthly_expected TEXT NOT NULL DEFAULT '[0,0,0,0,0,0,0,0,0,0,0,0]',
      monthly_actual   TEXT NOT NULL DEFAULT '[null,null,null,null,null,null,null,null,null,null,null,null]'
    );
  `)

  // Migrate external_resources: recreate if 'draft' status not supported
  const extDef = dbGet<{ sql: string }>(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='external_resources'"
  )?.sql ?? ''
  if (!extDef.includes("'draft'")) {
    db.run('PRAGMA foreign_keys = OFF')
    dbExec(`
      ALTER TABLE external_resources RENAME TO _ext_bak;
      CREATE TABLE external_resources (${EXT_SCHEMA});
      INSERT INTO external_resources
        (id, project_id, team_id, company_id, name, position, rate_type, rate,
         pr_number, po_number, status, country, allocation, month_start, month_end,
         total_po, comments, monthly_hours, monthly_expected, monthly_actual)
      SELECT id, project_id, team_id, company_id, name, position, rate_type, rate,
             pr_number, po_number, status, country, allocation, month_start, month_end,
             total_po, comments, monthly_hours, monthly_expected, monthly_actual
      FROM _ext_bak;
      DROP TABLE _ext_bak;
    `)
    db.run('PRAGMA foreign_keys = ON')
  }

  // Column-presence migrations
  const addColIfMissing = (table: string, col: string, def: string) => {
    const cols = dbAll<{ name: string }>(`PRAGMA table_info(${table})`).map(c => c.name)
    if (!cols.includes(col)) dbExec(`ALTER TABLE ${table} ADD COLUMN ${def}`)
  }

  const yr = String(new Date().getFullYear())
  addColIfMissing('external_people', 'year', `year INTEGER NOT NULL DEFAULT ${yr}`)
  addColIfMissing('internal_people', 'year', `year INTEGER NOT NULL DEFAULT ${yr}`)
  addColIfMissing('teams', 'year', `year INTEGER NOT NULL DEFAULT ${yr}`)
  addColIfMissing('internal_resources', 'team_id', 'team_id INTEGER REFERENCES teams(id)')
  addColIfMissing('other_resources', 'status', "status TEXT NOT NULL DEFAULT 'draft'")
  addColIfMissing('internal_people', 'total_hours', 'total_hours REAL NOT NULL DEFAULT 0')

  // Migrate legacy internal_resources → internal_people + internal_allocations
  const peopleCount = (dbGet<{ c: number }>('SELECT COUNT(*) as c FROM internal_people') as { c: number }).c
  const legacyCount = (dbGet<{ c: number }>('SELECT COUNT(*) as c FROM internal_resources') as { c: number }).c
  if (peopleCount === 0 && legacyCount > 0) {
    dbExec(`
      INSERT INTO internal_people (name, price_per_hour)
        SELECT DISTINCT name, price_per_hour FROM internal_resources;
      INSERT INTO internal_allocations (person_id, project_id, team_id, dedication_pct, monthly_hours, monthly_actual)
        SELECT
          (SELECT id FROM internal_people WHERE name = ir.name AND price_per_hour = ir.price_per_hour LIMIT 1),
          ir.project_id, ir.team_id, 100, ir.monthly_hours, ir.monthly_actual
        FROM internal_resources ir;
    `)
  }

  // Migrate external_resources → external_people + external_pos
  const extPeopleCount = (dbGet<{ c: number }>('SELECT COUNT(*) as c FROM external_people') as { c: number }).c
  const extResCount = (dbGet<{ c: number }>('SELECT COUNT(*) as c FROM external_resources') as { c: number }).c
  if (extPeopleCount === 0 && extResCount > 0) {
    dbExec(`
      INSERT INTO external_people (name, company_id, position, country, rate_type, rate, allocation)
        SELECT name, company_id, position, country, rate_type, rate, allocation
        FROM (
          SELECT name, company_id, position, country, rate_type, rate, allocation,
                 ROW_NUMBER() OVER (PARTITION BY name, COALESCE(company_id,-1), rate_type ORDER BY id) as rn
          FROM external_resources
        ) WHERE rn = 1;
      INSERT INTO external_pos (person_id, project_id, team_id, pr_number, po_number, status, month_start, month_end, total_po, comments, monthly_hours, monthly_expected, monthly_actual)
        SELECT
          (SELECT ep.id FROM external_people ep
           WHERE ep.name = er.name AND ep.company_id IS er.company_id AND ep.rate_type = er.rate_type LIMIT 1),
          er.project_id, er.team_id, er.pr_number, er.po_number, er.status,
          er.month_start, er.month_end, er.total_po, er.comments,
          er.monthly_hours, er.monthly_expected, er.monthly_actual
        FROM external_resources er;
    `)
  }

  dbRun(`INSERT OR IGNORE INTO settings(key,value) VALUES(@key,@value)`, {
    key: 'active_year',
    value: yr,
  })
}

export async function initDb(customPath?: string): Promise<void> {
  const SQL = await initSqlJs()
  if (!customPath) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((process.versions as any).electron) {
      // Running inside Electron — use userData path
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { app } = require('electron') as typeof import('electron')
      customPath = join(app.getPath('userData'), 'pm-tool.db')
    } else {
      // Running as a plain Node server
      const dir = join(homedir(), '.pm-tool')
      mkdirSync(dir, { recursive: true })
      customPath = join(dir, 'pm-tool.db')
    }
  }
  currentDbPath = customPath

  db = existsSync(currentDbPath)
    ? new SQL.Database(readFileSync(currentDbPath))
    : new SQL.Database()

  db.run('PRAGMA foreign_keys = ON')
  runMigrations()
  saveDb()
}
