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

    CREATE TABLE IF NOT EXISTS external_resources (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      company_id       INTEGER REFERENCES companies(id),
      name             TEXT NOT NULL,
      position         TEXT NOT NULL DEFAULT '',
      rate_type        TEXT NOT NULL CHECK(rate_type IN ('month','hour','fixed')),
      rate             REAL NOT NULL DEFAULT 0,
      pr_number        TEXT NOT NULL DEFAULT '',
      po_number        TEXT NOT NULL DEFAULT '',
      status           TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','complete')),
      country          TEXT NOT NULL DEFAULT '',
      allocation       REAL NOT NULL DEFAULT 100,
      month_start      INTEGER NOT NULL DEFAULT 1,
      month_end        INTEGER NOT NULL DEFAULT 12,
      total_po         REAL NOT NULL DEFAULT 0,
      comments         TEXT NOT NULL DEFAULT '',
      monthly_expected TEXT NOT NULL DEFAULT '[0,0,0,0,0,0,0,0,0,0,0,0]',
      monthly_actual   TEXT NOT NULL DEFAULT '[0,0,0,0,0,0,0,0,0,0,0,0]'
    );

    CREATE TABLE IF NOT EXISTS internal_resources (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name           TEXT NOT NULL,
      price_per_hour REAL NOT NULL DEFAULT 0,
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
      monthly_expected TEXT NOT NULL DEFAULT '[0,0,0,0,0,0,0,0,0,0,0,0]',
      monthly_actual   TEXT NOT NULL DEFAULT '[0,0,0,0,0,0,0,0,0,0,0,0]'
    );
  `)

  db.prepare(`INSERT OR IGNORE INTO settings(key,value) VALUES('active_year',?)`).run(
    String(new Date().getFullYear())
  )
}
