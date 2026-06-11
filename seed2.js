// Second batch import — run with: node seed2.js
const http = require('http')

function invoke(channel, ...args) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ channel, args })
    const req = http.request({
      hostname: 'localhost', port: 3000, path: '/api/invoke', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let data = ''
      res.on('data', c => (data += c))
      res.on('end', () => {
        const json = JSON.parse(data)
        if (json.ok) resolve(json.result)
        else reject(new Error(json.error))
      })
    })
    req.on('error', reject)
    req.write(body); req.end()
  })
}

const zeros = () => Array(12).fill(0)

// monthly_expected array for month-type resources (100% allocation)
function monthlyMonth(rate, start, end) {
  const arr = zeros()
  for (let i = start - 1; i < end; i++) arr[i] = rate
  return arr
}

// Distribute N hours evenly across [start,end] months (1-indexed), rest 0
function distributeHours(totalHours, start, end) {
  const n = end - start + 1
  const base = Math.floor(totalHours / n)
  const extra = totalHours - base * n
  return Array.from({ length: 12 }, (_, i) => {
    if (i + 1 < start || i + 1 > end) return 0
    return (i + 1 - start) < extra ? base + 1 : base
  })
}

// ─── Source data ─────────────────────────────────────────────────────────────

const NEW_COMPANIES = [
  { name: 'AMARIS', country: 'ES' },
  { name: 'EY',     country: 'GER' },
  { name: 'ASAP',   country: 'ES' },
]

// New people: [companyName, name, position, rate_type, rate, country]
const NEW_PEOPLE = [
  ['AMARIS',      'Catherine DI',   'ServiceNow Developer', 'month',  9100,     'ES'],
  ['AMARIS',      'Margarida FE',   'ServiceNow Developer', 'month',  7600,     'ES'],
  ['AMARIS',      'Illiana',        'ServiceNow Developer', 'month',  7600,     'ES'],
  ['Knowmadmood', 'Laura',          'ServiceNow Developer', 'month',  7050,     'ES'],
  ['Erni',        'Nicolas',        'QA Tester',            'month',  9500,     'ES'],
  ['Deloitte',    'Product Owner',  'Product Owner',        'month',  17367,    'GER'],
  [null,          'TBD1',           'Data Engineer',        'month',  9500,     'ES'],
  [null,          'TBD2',           'Data Engineer',        'month',  9500,     'ES'],
  ['EY',          'EY',             'DigiEX - EY',          'month',  119200,   'GER'],
  ['ASAP',        'ESCUELTIA',      'ServiceNow Developer', 'month',  9485.71,  'ES'],
]

// POs: [personName, pr, po, teamName, projectNumber, status, month_start, month_end, rateOverride, totalHoursIfHour]
// rateOverride = null means use person's rate; totalHoursIfHour = null for non-hour types
const POS = [
  // BCE – project 67037
  ['Eliana',        'PR2026267', '4701124428', 'BCE', '67037',    'open', 2, 12, null, null],
  ['Aron Galdon',   'PR2026275', '4701124429', 'BCE', '67037',    'open', 2, 12, null, null],
  ['Manuel',        'PR2026311', '4701128826', 'BCE', '67037',    'open', 2, 12, null, null],
  ['Aitor Mars',    'PR2026290', '4701124434', 'BCE', '67037',    'open', 2, 12, null, null],
  ['Jose Montufo',  'PR2026299', '4701124433', 'BCE', '67037',    'open', 2, 12, null, null],
  ['Ruben Navarro', 'PR2026303', '4701124432', 'BCE', '67037',    'open', 2, 12, null, null],
  ['Pere',          'PR2030089', '4701126853', 'BCE', '67037',    'open', 3, 12, null, null],
  ['Nicolas',       'PR2121002', '',           'BCE', '67037',    'open', 5, 12, null, null],
  // BCE – project 67635
  ['Victor Mas',    'PR2030011', '4701124431', 'BCE', '67635',    'open', 3, 12, null, null],
  ['Roberto Villa', 'PR2030081', '4701124430', 'BCE', '67635',    'open', 3, 12, null, null],
  ['Ruben Castillo','PR2030113', '4701126850', 'BCE', '67635',    'open', 3, 12, null, null],
  // BCE – project 66167RUN
  ['Celeste',       'PR2030178', '4701128827', 'BCE', '66167RUN', 'open', 2, 12, null, null],
  ['Aina M',        'PR2030200', '4701126852', 'BCE', '66167RUN', 'open', 2, 12, null, null],
  // BCE – project 67037 (hour-type)
  ['Tanja',         'PR2026252', '5100318423', 'BCE', '67037',    'open', 2, 12, null, 1560],
  ['Christian',     'PR2026259', '5100318421', 'BCE', '67037',    'open', 2, 12, null, 784],
  // BCE – project 68058
  ['Product Owner', '',          '',           'BCE', '68058',    'open', 7, 12, null, null],
  ['TBD1',          '',          '',           'BCE', '68058',    'open', 7, 12, null, null],
  ['TBD2',          '',          '',           'BCE', '68058',    'open', 6, 12, null, null],
  // DIGIEX – project 67947 (Catherine DI: two POs)
  ['Catherine DI',  'PR2014496', '4701115036', 'DIGIEX', '67947', 'open', 1,  1, null, null],
  ['Catherine DI',  'PR2026089', '4701129203', 'DIGIEX', '67947', 'open', 2, 12, null, null],
  // DIGIEX – project 67947 (Margarida FE: two POs)
  ['Margarida FE',  'PR2014513', '4701115037', 'DIGIEX', '67947', 'open', 1,  1, null, null],
  ['Margarida FE',  'PR2026141', '4701129202', 'DIGIEX', '67947', 'open', 2, 12, null, null],
  // DIGIEX – project 67947
  ['Illiana',       'PR2108277', '4701161860', 'DIGIEX', '67947', 'open', 4, 12, null, null],
  ['Laura',         'PR2108299', '4701161857', 'DIGIEX', '67947', 'open', 4, 12, null, null],
  ['ESCUELTIA',     '',          '',           'DIGIEX', '67947', 'open', 6, 12, null, null],
  // DIGIEX – project 67572 (EY: two POs, H1 and H2)
  ['EY',            'PR2026230', '5100318684', 'DIGIEX', '67572', 'open', 1,  6, null, null],
  ['EY',            '',          '',           'DIGIEX', '67572', 'open', 7, 12, null, null],
]

async function main() {
  // ── 1. Load current state ──────────────────────────────────────────────────
  const [settings, existingCompanies, teams, projects, existingPeople, existingPos] = await Promise.all([
    invoke('settings:get'),
    invoke('companies:list'),
    invoke('teams:list'),
    invoke('projects:list'),
    invoke('ext-people:list'),
    invoke('ext-pos:list', null),
  ])

  const activeYear = Number(settings.active_year) || new Date().getFullYear()
  console.log('Active year:', activeYear)

  // ── 2. Ensure companies ────────────────────────────────────────────────────
  const companyMap = {}
  for (const c of existingCompanies) companyMap[c.name.toLowerCase()] = c.id

  for (const { name, country } of NEW_COMPANIES) {
    if (!companyMap[name.toLowerCase()]) {
      const r = await invoke('companies:create', { name, country })
      companyMap[name.toLowerCase()] = r.id
      console.log(`Created company: ${name} (id=${r.id})`)
    } else {
      console.log(`Company exists: ${name}`)
    }
  }

  // helper: look up company by name (case-insensitive)
  const cid = name => name ? (companyMap[name.toLowerCase()] ?? null) : null

  // ── 3. Ensure teams ────────────────────────────────────────────────────────
  const teamMap = {}
  for (const t of teams) teamMap[t.name] = t.id

  for (const tName of ['BCE', 'DIGIEX']) {
    if (!teamMap[tName]) {
      const r = await invoke('teams:create', { name: tName, members: [], year: activeYear })
      teamMap[tName] = r.id
      console.log(`Created team: ${tName} (id=${r.id})`)
    } else {
      console.log(`Team exists: ${tName} (id=${teamMap[tName]})`)
    }
  }

  // ── 4. Ensure projects ─────────────────────────────────────────────────────
  const projectMap = {}
  for (const p of projects) projectMap[p.project_number] = p.id

  const projectDefs = [
    { project_number: '67037',    name: 'Project 67037',    team: 'BCE'    },
    { project_number: '67635',    name: 'Project 67635',    team: 'BCE'    },
    { project_number: '66167RUN', name: 'Project 66167RUN', team: 'BCE'    },
    { project_number: '67947',    name: 'Project 67947',    team: 'DIGIEX' },
    { project_number: '67572',    name: 'Project 67572',    team: 'DIGIEX' },
    { project_number: '68058',    name: 'Project 68058',    team: 'BCE'    },
  ]

  for (const { project_number, name, team } of projectDefs) {
    if (!projectMap[project_number]) {
      const r = await invoke('projects:create', {
        project_number, name, team_id: teamMap[team], year: activeYear,
        external_budget: 0, internal_budget: 0, additional_budget: 0,
      })
      projectMap[project_number] = r.id
      console.log(`Created project: ${project_number} (id=${r.id})`)
    } else {
      console.log(`Project exists: ${project_number} (id=${projectMap[project_number]})`)
    }
  }

  // ── 5. Ensure people ───────────────────────────────────────────────────────
  const personMap = {}
  for (const p of existingPeople) personMap[p.name] = p.id

  for (const [compName, name, position, rate_type, rate, country] of NEW_PEOPLE) {
    if (personMap[name]) {
      console.log(`Person exists: ${name} (id=${personMap[name]})`)
      continue
    }
    const r = await invoke('ext-people:upsert', {
      name, position, rate_type, rate, country,
      company_id: cid(compName),
      allocation: 100,
      year: activeYear,
    })
    personMap[name] = r.id
    console.log(`Created person: ${name} (id=${r.id})`)
  }

  // ── 6. Create POs ──────────────────────────────────────────────────────────
  const existingPoNumbers = new Set(existingPos.map(p => p.po_number).filter(Boolean))

  // Build a lookup of person rate_type by name
  const allPeople = await invoke('ext-people:list')
  const personInfo = {}
  for (const p of allPeople) personInfo[p.name] = p

  for (const [personName, pr, po, teamName, projNum, status, month_start, month_end, , totalHoursIfHour] of POS) {
    if (po && existingPoNumbers.has(po)) {
      console.log(`PO exists: ${po}`)
      continue
    }

    const person_id = personMap[personName]
    if (!person_id) { console.warn(`Person not found: ${personName}`); continue }

    const pInfo = personInfo[personName]
    const rate_type = pInfo?.rate_type ?? 'month'
    const rate = pInfo?.rate ?? 0

    let monthly_hours, monthly_expected
    if (rate_type === 'hour' && totalHoursIfHour != null) {
      monthly_hours = distributeHours(totalHoursIfHour, month_start, month_end)
      monthly_expected = monthly_hours.map(h => Math.round(h * rate))
    } else {
      monthly_hours = zeros()
      monthly_expected = monthlyMonth(rate, month_start, month_end)
    }

    const num_months = month_end - month_start + 1
    const total_po = rate_type === 'hour'
      ? Math.round(rate * (totalHoursIfHour ?? 0))
      : Math.round(rate * num_months)

    await invoke('ext-pos:upsert', {
      person_id,
      project_id: projectMap[projNum] ?? null,
      team_id: teamMap[teamName] ?? null,
      pr_number: pr,
      po_number: po,
      status,
      month_start,
      month_end,
      total_po,
      comments: '',
      monthly_hours,
      monthly_expected,
      monthly_actual: Array(12).fill(null),
    })
    console.log(`Created PO: ${po || '(no PO#)'} → ${personName} / ${projNum}`)
  }

  console.log('\nDone! Reload the app.')
}

main().catch(err => { console.error(err); process.exit(1) })
