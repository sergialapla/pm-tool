# PM Tool — Project Reference

## What this app does
Desktop app for managing projects, teams, and resources.
Multiple users share one SQLite `.db` file stored on a network drive.
Packaged and distributed as a Windows `.exe`.

## Tech stack
- **Electron 28** + **electron-forge** (build & packaging)
- **@electron-forge/plugin-vite** (Vite for renderer, Vite for main process bundling)
- **React 18** + **TypeScript** (renderer)
- **Ant Design 5** (all UI — tables, forms, tabs, layout)
- **React Router v6** with `HashRouter`
- **better-sqlite3** (SQLite in the main process)
- IPC via `ipcMain.handle` / `window.api.invoke(channel, ...args)`

## Project structure
```
pm-tool/
├── forge.config.ts          # electron-forge config (VitePlugin, makers)
├── vite.main.config.ts      # Vite config for main process
├── vite.preload.config.ts   # Vite config for preload
├── vite.renderer.config.ts  # Vite config for renderer (React + react plugin)
├── tsconfig.json
├── index.html               # Renderer HTML entry (Vite picks this up)
└── src/
    ├── main.ts              # Electron main process
    ├── preload.ts           # contextBridge → exposes window.api.invoke
    ├── db.ts                # SQLite init + migrations + getDb()
    ├── ipc.ts               # ALL ipcMain.handle registrations (single file)
    ├── renderer.tsx         # React entry point
    ├── App.tsx              # HashRouter + AppLayout wrapper
    ├── index.css            # Global reset
    ├── types.ts             # All TypeScript interfaces
    ├── components/
    │   └── AppLayout.tsx    # Ant Design Sider + Content shell
    └── pages/
        ├── Overview.tsx
        ├── Projects.tsx
        ├── Teams.tsx
        ├── Resources.tsx    # 3 tabs: External / Internal / Others
        └── Config.tsx       # 2 tabs: Companies / Settings
```

## Dev & build commands
```bash
npm start          # dev mode (hot reload, DevTools open)
npm run make       # build .exe installer for Windows
```

## Navigation
| Route | Page |
|---|---|
| /overview | Projects health + Teams health |
| /projects | Project list + detail |
| /teams | Team list + detail |
| /resources | 3 tabs: External / Internal / Others |
| /config | Companies list + DB path + active year |

## Data model

### companies  `id, name, country`
### teams  `id, name, members (JSON string array)`
### projects
`id, project_number, name, team_id→teams, year, external_budget, internal_budget, additional_budget`
- `total_budget` = ext + int + add *(computed in UI)*
- `total_forecast` = sum of all resource monthly values *(computed in UI)*

### external_resources (POs for external contractors)
`id, project_id→, company_id→, name, position, rate_type, rate, pr_number, po_number, status, country, allocation (0-100), month_start (1-12), month_end (1-12), total_po, comments, monthly_expected (JSON[12]), monthly_actual (JSON[12])`

**rate_type:** `month | hour | fixed`
**status:** `open | complete`

**Expected cost per active month:**
- `month` → `rate × (allocation / 100)`
- `hour` → `monthly_hours[i] × rate` (hours entered manually per month)
- `fixed` → entered manually per month

**Total PO:**
- `month` → `rate × (allocation/100) × num_months`
- `hour` → `rate × total_hours`
- `fixed` → entered manually

### internal_resources
`id, project_id→, name, price_per_hour, monthly_hours (JSON[12]), monthly_actual (JSON[12])`
- Expected per month = `monthly_hours[i] × price_per_hour`

### other_resources
`id, project_id→, team_id→, company_id→, pr_number, po_number, description, monthly_expected (JSON[12]), monthly_actual (JSON[12])`
- Both expected and actual entered manually

### settings (key-value)
- `active_year` — calendar year for all monthly columns (default: current year)
- `db_path` — path to shared `.db` file on network drive (overrides default userData path)

## Budget relationships
```
External Budget  ←→  total_po sum of external_resources for this project
Internal Budget  ←→  sum of (monthly_hours × price_per_hour) across all months
Additional Budget ←→ sum of other_resources monthly_expected
Total Budget     = external + internal + additional
Total Forecast   = sum of all monthly_expected across all 3 resource types
```

## Overview screen metrics
**Per project:** Total Budget, Total Forecast, % consumed, gap (Budget − Forecast)

**Per team:**
- Budget Needed = sum of internal resource costs for members of this team
- Budget Covered = sum of `internal_budget` from all projects assigned to this team
- Gap = Covered − Needed

## IPC channels (all called via `window.api.invoke(channel, data)`)
| Channel | Description |
|---|---|
| projects:list / :create / :update / :delete | Project CRUD |
| teams:list / :create / :update / :delete | Team CRUD |
| companies:list / :create / :update / :delete | Company CRUD |
| external:list(projectId?) / :upsert / :delete | External resource CRUD |
| internal:list(projectId?) / :upsert / :delete | Internal resource CRUD |
| others:list(projectId?) / :upsert / :delete | Other resource CRUD |
| settings:get / :set({key,value}) | Key-value settings |
| settings:setDbPath(path) | Reopen DB at a new path |

## Monthly data convention
- All monthly arrays are **length 12**, index 0 = January, index 11 = December
- Stored as JSON strings in SQLite, parsed back to `number[]` by the IPC layer
- Active year is global (Config → Settings)

## Key business rules
1. Resources are managed in the Resources section, **not** inside a project detail.
2. A team can participate in multiple projects.
3. External people can be shared across teams; each project needs its own PO.
4. Equipment, travel, licenses → Other Resources (against Additional Budget).
5. Multiple users share data by pointing the app at the same `.db` file (Config → Settings → DB Path).

## Important notes
- `forge.config.js` (old JS) is superseded by `forge.config.ts` — delete the old one if it causes issues.
- The preload exposes only `window.api.invoke(channel, ...args)` — all IPC goes through this single method.
- `better-sqlite3` is a native module; `@electron-forge/plugin-auto-unpack-natives` handles it automatically.
