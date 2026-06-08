import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'

let db: Database.Database

export function getDb(): Database.Database {
  return db
}

export function initDb(customPath?: string): void {
  const dbPath = customPath || join(app.getPath('userData'), 'pm-tool.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations()
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
  db.exec(`
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
  const extDef = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='external_resources'").get() as { sql: string } | null)?.sql || ''
  if (!extDef.includes("'draft'")) {
    db.pragma('foreign_keys = OFF')
    db.exec(`
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
    db.pragma('foreign_keys = ON')
  }

  // Migrate external_people: add year
  const extPeopleCols = (db.prepare('PRAGMA table_info(external_people)').all() as { name: string }[]).map(c => c.name)
  if (!extPeopleCols.includes('year')) {
    db.exec(`ALTER TABLE external_people ADD COLUMN year INTEGER NOT NULL DEFAULT ${new Date().getFullYear()}`)
  }

  // Migrate internal_people: add year
  const intPeopleCols = (db.prepare('PRAGMA table_info(internal_people)').all() as { name: string }[]).map(c => c.name)
  if (!intPeopleCols.includes('year')) {
    db.exec(`ALTER TABLE internal_people ADD COLUMN year INTEGER NOT NULL DEFAULT ${new Date().getFullYear()}`)
  }

  // Migrate teams: add year
  const teamCols = (db.prepare('PRAGMA table_info(teams)').all() as { name: string }[]).map(c => c.name)
  if (!teamCols.includes('year')) {
    db.exec(`ALTER TABLE teams ADD COLUMN year INTEGER NOT NULL DEFAULT ${new Date().getFullYear()}`)
  }

  // Migrate internal_resources: add team_id
  const intCols = (db.prepare('PRAGMA table_info(internal_resources)').all() as { name: string }[]).map(c => c.name)
  if (!intCols.includes('team_id')) {
    db.exec(`ALTER TABLE internal_resources ADD COLUMN team_id INTEGER REFERENCES teams(id)`)
  }

  // Migrate other_resources: add status
  const othCols = (db.prepare('PRAGMA table_info(other_resources)').all() as { name: string }[]).map(c => c.name)
  if (!othCols.includes('status')) {
    db.exec(`ALTER TABLE other_resources ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'`)
  }

  // Migrate internal_people: add total_hours
  const peopleCols = (db.prepare('PRAGMA table_info(internal_people)').all() as { name: string }[]).map(c => c.name)
  if (!peopleCols.includes('total_hours')) {
    db.exec(`ALTER TABLE internal_people ADD COLUMN total_hours REAL NOT NULL DEFAULT 0`)
  }

  // Migrate legacy internal_resources → internal_people + internal_allocations
  const peopleCount = (db.prepare('SELECT COUNT(*) as c FROM internal_people').get() as { c: number }).c
  const legacyCount = (db.prepare('SELECT COUNT(*) as c FROM internal_resources').get() as { c: number }).c
  if (peopleCount === 0 && legacyCount > 0) {
    db.exec(`
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
  const extPeopleCount = (db.prepare('SELECT COUNT(*) as c FROM external_people').get() as { c: number }).c
  const extResCount = (db.prepare('SELECT COUNT(*) as c FROM external_resources').get() as { c: number }).c
  if (extPeopleCount === 0 && extResCount > 0) {
    db.exec(`
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

  db.prepare(`INSERT OR IGNORE INTO settings(key,value) VALUES('active_year',?)`).run(
    String(new Date().getFullYear())
  )
}
