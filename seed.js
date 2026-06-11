// One-time data import script — run with: node seed.js
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
const monthlyMonth = (rate, start, end) => {
  const arr = zeros()
  for (let i = start - 1; i < end; i++) arr[i] = rate
  return arr
}

// ─── Source data ─────────────────────────────────────────────────────────────
// Companies needed
const COMPANIES_NEEDED = [
  { name: 'Erni',        country: 'ES' },
  { name: 'Knowmadmood', country: 'ES' },
  { name: 'InnoIT',      country: 'ES' },
  { name: 'SDG',         country: 'ES' },
  { name: 'Deloitte',    country: 'GER' },
]

// People: [companyName, name, position, rate_type, rate, country]
const PEOPLE = [
  ['Erni',        'Oscar del Alamo', 'Data Engineer',          'month', 10000, 'ES'],
  ['Erni',        'Eliana',          'Data Engineer',          'month',  8700, 'ES'],
  ['Erni',        'Aron Galdon',     'Data Engineer',          'month',  8700, 'ES'],
  ['Erni',        'Manuel',          'Senior Cloud Architect', 'month', 12700, 'ES'],
  ['Erni',        'Aitor Mars',      'Data Engineer',          'month',  8000, 'ES'],
  ['Erni',        'Victor Mas',      'Software Engineer',      'month',  8800, 'ES'],
  ['Erni',        'Celeste',         'IT Project Manager',     'month', 11000, 'ES'],
  ['Erni',        'Roberto Villa',   'Frontend Engineer',      'month',  8200, 'ES'],
  ['Knowmadmood', 'Jose Montufo',    'Backend Developer',      'month',  8400, 'ES'],
  ['Knowmadmood', 'Ruben Navarro',   'Data Engineer',          'month',  9300, 'ES'],
  ['InnoIT',      'Ruben Castillo',  'UX/UI Designer',         'month',  3450, 'ES'],
  ['SDG',         'Pere',            'Data Engineer',          'month',  4125, 'ES'],
  ['Erni',        'Aina M',          'IT Product Owner',       'month',  9500, 'ES'],
  ['Deloitte',    'Tanja',           'Business Analyst',       'hour',    185, 'GER'],
  ['Deloitte',    'Christian',       'Solution Architect',     'hour',    235, 'GER'],
]

// POs: [personName, pr, po, status, month_start, month_end, total_po, monthly_hours_override]
// monthly_hours_override only for hour-type: [Jan,Feb,...] array of hours per month
const POS = [
  ['Oscar del Alamo', 'PR1991538', '4701102991', 'open', 1, 3, 30000,  null],
  ['Eliana',          'PR1991533', '4701102989', 'open', 1, 3, 26100,  null],
  ['Aron Galdon',     'PR1991498', '4701103071', 'open', 1, 3, 26100,  null],
  ['Manuel',          'PR1991606', '4701103517', 'open', 1, 3, 38100,  null],
  ['Aitor Mars',      'PR1991486', '4701103538', 'open', 1, 3, 24000,  null],
  ['Victor Mas',      'PR1991554', '4701102993', 'open', 1, 3, 26400,  null],
  ['Celeste',         'PR1991516', '4701103070', 'open', 1, 3, 33000,  null],
  ['Roberto Villa',   'PR1991544', '4701102992', 'open', 1, 3, 24600,  null],
  ['Jose Montufo',    'PR1991620', '4701102990', 'open', 1, 3, 25200,  null],
  ['Ruben Navarro',   'PR1991648', '4701102985', 'open', 1, 3, 27900,  null],
  ['Ruben Castillo',  'PR1991736', '4701103481', 'open', 1, 3, 10350,  null],
  ['Pere',            'PR1997283', '4701104406', 'open', 1, 3, 12375,  null],
  ['Aina M',          'PR1991460', '4701103539', 'open', 1, 3, 28500,  null],
  // hour-type — monthly_hours split over 3 months totalling the contracted hours
  ['Tanja',    'PR1991781', '5100301234', 'open', 1, 3, 59200, [105, 105, 110, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  ['Christian','PR1991718', '5100301233', 'open', 1, 3, 37600, [50,  50,  60,  0, 0, 0, 0, 0, 0, 0, 0, 0]],
]

async function main() {
  // ── 1. Load current state ────────────────────────────────────────────────
  const [settings, existingCompanies, teams, projects] = await Promise.all([
    invoke('settings:get'),
    invoke('companies:list'),
    invoke('teams:list'),
    invoke('projects:list'),
  ])

  const activeYear = Number(settings.active_year) || new Date().getFullYear()
  console.log('Active year:', activeYear)

  // ── 2. Ensure companies exist ─────────────────────────────────────────────
  const companyMap = {}
  for (const c of existingCompanies) companyMap[c.name] = c.id

  for (const { name, country } of COMPANIES_NEEDED) {
    if (!companyMap[name]) {
      const r = await invoke('companies:create', { name, country })
      companyMap[name] = r.id
      console.log(`Created company: ${name} (id=${r.id})`)
    } else {
      console.log(`Company exists: ${name} (id=${companyMap[name]})`)
    }
  }

  // ── 3. Ensure BCE team exists for active year ────────────────────────────
  let bceTeam = teams.find(t => t.name === 'BCE' && t.year === activeYear)
  if (!bceTeam) {
    bceTeam = await invoke('teams:create', { name: 'BCE', members: [], year: activeYear })
    console.log(`Created team: BCE (id=${bceTeam.id})`)
  } else {
    console.log(`Team exists: BCE (id=${bceTeam.id})`)
  }

  // ── 4. Ensure project 66167 exists for active year ───────────────────────
  let project = projects.find(p => p.project_number === '66167' && p.year === activeYear)
  if (!project) {
    project = await invoke('projects:create', {
      project_number: '66167', name: 'Project 66167',
      team_id: bceTeam.id, year: activeYear,
      external_budget: 0, internal_budget: 0, additional_budget: 0,
    })
    console.log(`Created project: 66167 (id=${project.id})`)
  } else {
    console.log(`Project exists: 66167 (id=${project.id})`)
  }

  // ── 5. Load existing people to avoid duplicates ──────────────────────────
  const existingPeople = await invoke('ext-people:list')
  const personMap = {}
  for (const p of existingPeople) personMap[p.name] = p.id

  // ── 6. Create people ─────────────────────────────────────────────────────
  for (const [compName, name, position, rate_type, rate, country] of PEOPLE) {
    if (personMap[name]) {
      console.log(`Person exists: ${name} (id=${personMap[name]})`)
      continue
    }
    const r = await invoke('ext-people:upsert', {
      name, position, rate_type, rate, country,
      company_id: companyMap[compName],
      allocation: 100,
      year: activeYear,
    })
    personMap[name] = r.id
    console.log(`Created person: ${name} (id=${r.id})`)
  }

  // ── 7. Create POs ─────────────────────────────────────────────────────────
  const existingPos = await invoke('ext-pos:list', null)
  const existingPoNumbers = new Set(existingPos.map(p => p.po_number))

  for (const [personName, pr, po, status, month_start, month_end, total_po, hoursArr] of POS) {
    if (existingPoNumbers.has(po)) {
      console.log(`PO exists: ${po}`)
      continue
    }
    const person = PEOPLE.find(p => p[1] === personName)
    const rate_type = person[3]
    const rate = person[4]
    const person_id = personMap[personName]

    let monthly_hours, monthly_expected
    if (rate_type === 'hour') {
      monthly_hours = hoursArr
      monthly_expected = hoursArr.map(h => h * rate)
    } else {
      monthly_hours = zeros()
      monthly_expected = monthlyMonth(rate, month_start, month_end)
    }

    await invoke('ext-pos:upsert', {
      person_id,
      project_id: project.id,
      team_id: bceTeam.id,
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
    console.log(`Created PO: ${po} → ${personName}`)
  }

  console.log('\nDone! Reload the app.')
}

main().catch(err => { console.error(err); process.exit(1) })
