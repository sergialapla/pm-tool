import { useEffect, useRef, useState } from 'react'
import {
  Tabs, Table, Button, Drawer, Form, Input, InputNumber,
  Select, Space, Popconfirm, Typography, Tag, Divider, Tooltip,
  Row, Col, Card, Modal, Progress
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckOutlined, CloseOutlined, CaretRightOutlined, CaretDownOutlined } from '@ant-design/icons'
import { api } from '../utils/api'
import { MONTHS, fmt, sumArr, calcPOExpected, calcPOForecast, calcPOPrevision, calcAllocationExpected } from '../utils/format'
import type { ExternalPerson, ExternalPO, InternalPerson, InternalAllocation, OtherResource, Project, Company, Team, RateType, POStatus } from '../types'

const { Title, Text } = Typography
const ZERO12 = () => Array(12).fill(0) as number[]
const NULL12 = () => Array(12).fill(null) as (number | null)[]

// ─────────────────────────────────────────────────────────────────────────────
// MonthlyGrid
// - activeRange: months outside [start,end] are disabled/grayed
// - onExpectedChange: when provided, expected row becomes editable inputs
// ─────────────────────────────────────────────────────────────────────────────

function MonthlyGrid({
  expected, actual, onActualChange,
  showHours, hours, onHoursChange,
  showExpected, activeRange, onExpectedChange,
  disableActual, disableHours, onConfirmActual, nullableActual,
}: {
  expected: number[]
  actual: (number | null)[]
  onActualChange?: (i: number, v: number | null) => void
  showHours?: boolean
  hours?: number[]
  onHoursChange?: (i: number, v: number) => void
  showExpected?: boolean
  activeRange?: { start: number; end: number }
  onExpectedChange?: (i: number, v: number) => void
  disableActual?: boolean
  disableHours?: boolean
  onConfirmActual?: (i: number) => void
  nullableActual?: boolean
}) {
  const active = (i: number) => !activeRange || (i + 1 >= activeRange.start && i + 1 <= activeRange.end)
  const cellBg = (i: number): React.CSSProperties => ({ background: !active(i) ? '#f5f5f5' : undefined })
  const isConfirmed = (i: number) => active(i) && actual[i] !== null && actual[i] !== undefined && actual[i] === expected[i]

  return (
    <div>
      <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 58 }} />
          {MONTHS.map(m => <col key={m} />)}
        </colgroup>
        <thead>
          <tr>
            <td style={{ fontWeight: 600, paddingRight: 4 }} />
            {MONTHS.map((m, i) => (
              <td key={m} style={{ textAlign: 'center', fontWeight: 600, padding: '4px 2px', fontSize: 11, color: !active(i) ? '#ccc' : undefined }}>{m}</td>
            ))}
          </tr>
        </thead>
        <tbody>
          {showExpected !== false && (
            <tr>
              <td style={{ color: '#888', paddingRight: 4, fontSize: 11 }}>Exp.</td>
              {expected.map((v, i) => (
                <td key={i} style={{ padding: '2px 1px', ...cellBg(i) }}>
                  {onExpectedChange ? (
                    <InputNumber size="small" value={v} min={0} disabled={!active(i)} style={{ width: '100%' }}
                      onChange={val => onExpectedChange(i, val ?? 0)} />
                  ) : (
                    <span style={{ color: active(i) ? '#888' : '#ccc', display: 'block', textAlign: 'center', fontSize: 11 }}>{fmt(v)}</span>
                  )}
                </td>
              ))}
            </tr>
          )}
          {showHours && (
            <tr>
              <td style={{ color: '#555', paddingRight: 4, fontSize: 11 }}>Hours</td>
              {(hours || ZERO12()).map((v, i) => (
                <td key={i} style={{ padding: '2px 1px', ...cellBg(i) }}>
                  <InputNumber size="small" value={v} min={0} disabled={!active(i) || !!disableHours} style={{ width: '100%' }}
                    onChange={val => onHoursChange?.(i, val ?? 0)} />
                </td>
              ))}
            </tr>
          )}
          <tr>
            <td style={{ color: '#1677ff', fontWeight: 600, paddingRight: 4, fontSize: 11 }}>Act.</td>
            {actual.map((v, i) => (
              <td key={i} style={{ padding: '2px 1px', ...cellBg(i) }}>
                <InputNumber
                  size="small"
                  value={v ?? undefined}
                  min={0}
                  disabled={!active(i) || !!disableActual}
                  style={{ width: '100%', ...(isConfirmed(i) ? { color: '#52c41a' } : {}) }}
                  styles={isConfirmed(i) ? { input: { color: '#52c41a', fontWeight: 600 } } : undefined}
                  onChange={val => onActualChange?.(i, nullableActual ? val : (val ?? 0))}
                />
              </td>
            ))}
          </tr>
          {onConfirmActual && !disableActual && (
            <tr>
              <td style={{ color: '#888', paddingRight: 4, fontSize: 11 }}>OK</td>
              {expected.map((exp, i) => (
                <td key={i} style={{ padding: '2px 1px', textAlign: 'center', ...cellBg(i) }}>
                  {active(i) && exp > 0 ? (
                    <Tooltip title={`Copy expected (${fmt(exp)}) to actual`}>
                      <Button
                        size="small"
                        type={isConfirmed(i) ? 'primary' : 'default'}
                        style={{ width: '100%', fontSize: 11, padding: '0 2px', ...(isConfirmed(i) ? { background: '#52c41a', borderColor: '#52c41a' } : {}) }}
                        onClick={() => onConfirmActual(i)}
                      >✓</Button>
                    </Tooltip>
                  ) : null}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// Main Resources page
// ─────────────────────────────────────────────────────────────────────────────

export default function Resources(): JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [year, setYear] = useState<number>(new Date().getFullYear())

  useEffect(() => {
    Promise.all([api.projects.list(), api.companies.list(), api.teams.list(), api.settings.get()])
      .then(([p, c, t, s]) => {
        setProjects(p); setCompanies(c); setTeams(t)
        setYear(Number((s as { active_year?: string }).active_year) || new Date().getFullYear())
      })
  }, [])

  const filteredProjects = projects.filter(p => p.year === year)
  const sharedProps = { projects: filteredProjects, companies, teams, year }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Resources</Title>
        <Tag color="blue" style={{ fontSize: 13, padding: '2px 10px' }}>{year}</Tag>
      </div>
      <Tabs items={[
        { key: 'external', label: 'External', children: <ExternalTab {...sharedProps} /> },
        { key: 'internal', label: 'Internal', children: <InternalTab {...sharedProps} /> },
        { key: 'others', label: 'Others', children: <OthersTab {...sharedProps} /> },
      ]} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// External Resources Tab  (people → POs model, card layout)
// ─────────────────────────────────────────────────────────────────────────────

function ExternalTab({ projects, companies, teams, year }: { projects: Project[]; companies: Company[]; teams: Team[]; year: number }) {
  const [people, setPeople] = useState<ExternalPerson[]>([])
  const [pos, setPos]       = useState<ExternalPO[]>([])

  // Inline person editing
  const [inlinePersonId, setInlinePersonId] = useState<number | null>(null)
  const [inlinePersonVals, setInlinePersonVals] = useState({
    name: '', company_id: null as number | null, position: '', country: '',
    rate_type: 'month' as RateType, rate: 0, allocation: 100, year: new Date().getFullYear(),
  })

  // Add person modal
  const [addPersonOpen, setAddPersonOpen] = useState(false)
  const [addPersonForm] = Form.useForm()

  // Add PO drawer state
  const [poDrawerOpen, setPoDrawerOpen]     = useState(false)
  const [poDrawerPersonId, setPoDrawerPersonId] = useState<number | null>(null)
  const [poForm] = Form.useForm()
  const [rateType, setRateType]         = useState<RateType>('month')
  const [monthStart, setMonthStart]     = useState(1)
  const [monthEnd, setMonthEnd]         = useState(12)
  const [formRate, setFormRate]         = useState(0)
  const [formAllocation, setFormAllocation] = useState(100)
  const [formStatus, setFormStatus]     = useState<POStatus>('draft')
  const [monthlyHours, setMonthlyHours] = useState<number[]>(ZERO12())
  const [monthlyActual, setMonthlyActual] = useState<(number | null)[]>(NULL12())
  const [totalHours, setTotalHours]     = useState(0)
  const [fixedExpected, setFixedExpected] = useState<number[]>(ZERO12())
  const skipPoChange = useRef(false)

  // Inline PO editing
  const [inlinePOId, setInlinePOId]     = useState<number | null>(null)
  const [inlinePOPersonId, setInlinePOPersonId] = useState<number | null>(null)
  const [inlinePOVals, setInlinePOVals] = useState({
    project_id:  null as number | null,
    team_id:     null as number | null,
    pr_number:   '',
    po_number:   '',
    status:      'draft' as POStatus,
    month_start: 1,
    month_end:   12,
    total_po:    0,
    comments:    '',
    monthly_hours:  ZERO12() as number[],
    monthly_actual: NULL12() as (number | null)[],
  })
  const [inlinePOTotalHours, setInlinePOTotalHours] = useState(0)
  const [inlinePOFixedExp, setInlinePOFixedExp] = useState<number[]>(ZERO12())
  const skipInlinePoChange = useRef(false)

  // Expanded POs
  const [expandedPOs, setExpandedPOs] = useState<Set<number>>(new Set())
  const togglePO = (id: number) => setExpandedPOs(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })

  const load = async () => {
    const [p, po] = await Promise.all([api.extPeople.list(), api.extPos.list()])
    setPeople(p); setPos(po)
  }
  useEffect(() => { load() }, [])

  const projectIds = new Set(projects.map(p => p.id))
  const personPOs = (personId: number) => pos.filter(po => po.person_id === personId && (po.project_id === null || projectIds.has(po.project_id)))
  const companyName = (id: number | null) => companies.find(c => c.id === id)?.name || ''
  const projectName = (id: number | null) => id ? (projects.find(p => p.id === id)?.project_number + ' ' + projects.find(p => p.id === id)?.name || '—') : '—'
  const teamName    = (id: number | null) => id ? (teams.find(t => t.id === id)?.name || '—') : '—'

  const distributeHours = (total: number, start: number, end: number): number[] => {
    const n = Math.max(1, end - start + 1)
    const perMonth = Math.round(total / n * 100) / 100
    return Array.from({ length: 12 }, (_, i) => (i + 1 >= start && i + 1 <= end) ? perMonth : 0)
  }


  // ── Drawer: recalcTotalPo ────────────────────────────────────────────────────
  const recalcTotalPo = (v: Record<string, unknown>, exactHoursTotal?: number) => {
    const rt = (v.rate_type as RateType) || rateType
    const rate = (v.rate as number) ?? formRate
    const alloc = (v.allocation as number) ?? formAllocation
    const ms = (v.month_start as number) || monthStart
    const me = (v.month_end as number) || monthEnd

    if (rt === 'fixed') {
      const currentPo = (v.total_po as number) || 0
      const n = Math.max(1, me - ms + 1)
      setFixedExpected(Array.from({ length: 12 }, (_, i) => (i + 1 >= ms && i + 1 <= me) ? Math.round(currentPo / n * 100) / 100 : 0))
      return
    }

    let po = 0
    if (rt === 'month') po = Math.round(rate * alloc) / 100 * Math.max(0, me - ms + 1)
    else if (rt === 'hour') po = Math.round(rate * (exactHoursTotal ?? totalHours))

    skipPoChange.current = true
    poForm.setFieldValue('total_po', Math.round(po))
  }

  const onPoFormValuesChange = (changed: Record<string, unknown>, all: Record<string, unknown>) => {
    if (changed.status !== undefined) setFormStatus(changed.status as POStatus)

    if (skipPoChange.current) { skipPoChange.current = false; return }

    const onlyNonCalc = Object.keys(changed).every(k => k === 'status' || k === 'total_po')
    if (onlyNonCalc) {
      if ('total_po' in changed && rateType === 'fixed') {
        const newPo = (all.total_po as number) || 0
        const ms = (all.month_start as number) || monthStart
        const me = (all.month_end as number) || monthEnd
        const n = Math.max(1, me - ms + 1)
        setFixedExpected(Array.from({ length: 12 }, (_, i) =>
          (i + 1 >= ms && i + 1 <= me) ? Math.round(newPo / n * 100) / 100 : 0
        ))
      }
      return
    }

    const rt = all.rate_type as RateType
    const ms = all.month_start as number
    const me = all.month_end as number
    if (rt !== undefined) setRateType(rt)
    if (ms !== undefined) setMonthStart(ms)
    if (me !== undefined) setMonthEnd(me)

    if ('rate_type' in changed) {
      const newRt = changed.rate_type as RateType
      if (newRt === 'fixed') {
        setFixedExpected(ZERO12())
        skipPoChange.current = true
        poForm.setFieldValue('total_po', 0)
        return
      }
      if (newRt === 'hour') {
        setTotalHours(0)
        setMonthlyHours(distributeHours(0, ms ?? monthStart, me ?? monthEnd))
        skipPoChange.current = true
        poForm.setFieldValue('total_po', 0)
        return
      }
    }

    if ((ms !== undefined || me !== undefined) && (rt || rateType) === 'hour') {
      setMonthlyHours(distributeHours(totalHours, ms ?? monthStart, me ?? monthEnd))
      recalcTotalPo(all, totalHours)
      return
    }
    recalcTotalPo(all)
  }

  const onTotalHoursChange = (val: number | null) => {
    const total = val ?? 0
    setTotalHours(total)
    setMonthlyHours(distributeHours(total, monthStart, monthEnd))
    recalcTotalPo(poForm.getFieldsValue(), total)
  }

  // Derived: live expected for the drawer (uses person's rate_type/rate/allocation from people state)
  const drawerPerson = people.find(p => p.id === poDrawerPersonId)
  const drawerRateType = drawerPerson?.rate_type ?? rateType
  const drawerRate     = drawerPerson?.rate ?? formRate
  const drawerAlloc    = drawerPerson?.allocation ?? formAllocation

  const drawerRateColor = drawerRateType === 'month' ? 'blue' : drawerRateType === 'hour' ? 'green' : 'orange'

  const drawerLiveExpected = (() => {
    if (drawerRateType === 'fixed') return fixedExpected
    if (drawerRateType === 'hour') {
      const totalPo = Math.round(drawerRate * totalHours)
      const n = Math.max(1, monthEnd - monthStart + 1)
      return Array.from({ length: 12 }, (_, i) =>
        (i + 1 >= monthStart && i + 1 <= monthEnd) ? Math.round(totalPo / n) : 0
      )
    }
    // month
    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1
      return (month >= monthStart && month <= monthEnd) ? Math.round(drawerRate * drawerAlloc) / 100 : 0
    })
  })()
  const drawerLiveHourlyActual = monthlyHours.map(h => Math.round(h * drawerRate))

  // ── Open add PO drawer ───────────────────────────────────────────────────────
  const openAddPO = (personId: number) => {
    const person = people.find(p => p.id === personId)
    setPoDrawerPersonId(personId)
    setRateType(person?.rate_type ?? 'month')
    setFormRate(person?.rate ?? 0)
    setFormAllocation(person?.allocation ?? 100)
    setFormStatus('draft')
    setMonthStart(1); setMonthEnd(12)
    setMonthlyHours(ZERO12()); setMonthlyActual(NULL12())
    setTotalHours(0); setFixedExpected(ZERO12())
    poForm.resetFields()
    poForm.setFieldsValue({ month_start: 1, month_end: 12, status: 'draft', total_po: 0 })
    setPoDrawerOpen(true)
  }

  const savePO = async () => {
    let vals: Record<string, unknown>
    try { vals = await poForm.validateFields() } catch { return }
    const exp = drawerRateType === 'fixed' ? fixedExpected : drawerLiveExpected
    const act = drawerRateType === 'hour' ? drawerLiveHourlyActual.map(v => v as number | null) : monthlyActual
    await api.extPos.upsert({
      ...vals,
      person_id: poDrawerPersonId!,
      monthly_hours: monthlyHours,
      monthly_expected: exp,
      monthly_actual: act,
    } as ExternalPO)
    setPoDrawerOpen(false); load()
  }

  const deletePO = async (id: number) => { await api.extPos.delete(id); load() }

  // ── Inline person editing ────────────────────────────────────────────────────
  const startPersonEdit = (p: ExternalPerson) => {
    setInlinePersonId(p.id!)
    setInlinePersonVals({
      name: p.name, company_id: p.company_id ?? null, position: p.position,
      country: p.country, rate_type: p.rate_type, rate: p.rate, allocation: p.allocation,
      year: p.year,
    })
  }
  const cancelPersonEdit = () => setInlinePersonId(null)
  const confirmPersonEdit = async (personId: number) => {
    await api.extPeople.upsert({ id: personId, ...inlinePersonVals } as ExternalPerson)
    setInlinePersonId(null); load()
  }
  const deletePerson = async (id: number) => { await api.extPeople.delete(id); load() }

  // ── Add person modal ─────────────────────────────────────────────────────────
  const openAddPerson = () => { addPersonForm.resetFields(); addPersonForm.setFieldsValue({ year }); setAddPersonOpen(true) }
  const saveAddPerson = async () => {
    let vals: Record<string, unknown>
    try { vals = await addPersonForm.validateFields() } catch { return }
    await api.extPeople.upsert(vals as unknown as ExternalPerson)
    setAddPersonOpen(false); load()
  }

  // ── Inline PO editing ────────────────────────────────────────────────────────
  const startPOEdit = (po: ExternalPO) => {
    const person = people.find(p => p.id === po.person_id)
    setInlinePOId(po.id!)
    setInlinePOPersonId(po.person_id)
    const hrs = po.monthly_hours || ZERO12()
    const totalH = sumArr(hrs)
    setInlinePOTotalHours(totalH)
    if (person?.rate_type === 'fixed') {
      const n = Math.max(1, (po.month_end || 12) - (po.month_start || 1) + 1)
      setInlinePOFixedExp(Array.from({ length: 12 }, (_, i) =>
        (i + 1 >= (po.month_start || 1) && i + 1 <= (po.month_end || 12)) ? Math.round((po.total_po || 0) / n * 100) / 100 : 0
      ))
    } else {
      setInlinePOFixedExp(ZERO12())
    }
    setInlinePOVals({
      project_id:  po.project_id,
      team_id:     po.team_id,
      pr_number:   po.pr_number,
      po_number:   po.po_number,
      status:      po.status,
      month_start: po.month_start,
      month_end:   po.month_end,
      total_po:    po.total_po,
      comments:    po.comments,
      monthly_hours:  [...hrs],
      monthly_actual: [...(po.monthly_actual || NULL12())],
    })
  }
  const cancelPOEdit = () => setInlinePOId(null)
  const confirmPOEdit = async (poId: number) => {
    const person = people.find(p => p.id === inlinePOPersonId)
    const liveExp = person ? calcPOExpected(person, {
      month_start: inlinePOVals.month_start,
      month_end: inlinePOVals.month_end,
      monthly_hours: inlinePOVals.monthly_hours,
      monthly_expected: inlinePOFixedExp,
    }) : ZERO12()
    const exp = person?.rate_type === 'fixed' ? inlinePOFixedExp : liveExp
    await api.extPos.upsert({
      id: poId,
      person_id: inlinePOPersonId!,
      ...inlinePOVals,
      monthly_expected: exp,
    } as ExternalPO)
    setInlinePOId(null); load()
  }

  const inlinePORecalcTotalPo = () => {
    const person = people.find(p => p.id === inlinePOPersonId)
    if (!person) return
    const rt = person.rate_type
    const ms = inlinePOVals.month_start
    const me = inlinePOVals.month_end
    if (rt === 'month') {
      const po = Math.round(person.rate * person.allocation) / 100 * Math.max(0, me - ms + 1)
      skipInlinePoChange.current = true
      setInlinePOVals(prev => ({ ...prev, total_po: Math.round(po) }))
    } else if (rt === 'hour') {
      const po = Math.round(person.rate * inlinePOTotalHours)
      skipInlinePoChange.current = true
      setInlinePOVals(prev => ({ ...prev, total_po: Math.round(po) }))
    }
  }

  const yearOpts = Array.from({ length: 10 }, (_, i) => { const y = new Date().getFullYear() - 2 + i; return { value: y, label: String(y) } })
  const compOpts = [{ value: null, label: 'None' }, ...companies.map(c => ({ value: c.id, label: c.name }))]
  const monthOpts = MONTHS.map((m, i) => ({ value: i + 1, label: m }))

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAddPerson}>Add Person</Button>
      </div>

      <Row gutter={[16, 16]}>
        {people.filter(p => p.year === year).map(person => {
          const isEditing = inlinePersonId === person.id
          const pPOs = personPOs(person.id!)
          const totalExp  = pPOs.reduce((s, po) => s + sumArr(calcPOForecast(person, po)), 0)
          const totalAct  = pPOs.reduce((s, po) => s + sumArr(po.monthly_actual || []), 0)
          const totalPrev = pPOs.reduce((s, po) => s + calcPOPrevision(person, po), 0)
          const actPct    = totalExp > 0 ? totalAct  / totalExp * 100 : 0
          const prevPct   = totalExp > 0 ? totalPrev / totalExp * 100 : 0
          const rateColor = (isEditing ? inlinePersonVals.rate_type : person.rate_type) === 'month' ? 'blue'
            : (isEditing ? inlinePersonVals.rate_type : person.rate_type) === 'hour' ? 'green' : 'orange'

          return (
            <Col xs={24} md={12} key={person.id}>
              <Card
                size="small"
                style={{ height: '100%' }}
                title={
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    {isEditing ? (
                      <Input
                        value={inlinePersonVals.name}
                        onChange={e => setInlinePersonVals(v => ({ ...v, name: e.target.value }))}
                        size="small" style={{ flex: 1, fontWeight: 600 }} autoFocus
                        onPressEnter={() => confirmPersonEdit(person.id!)}
                      />
                    ) : (
                      <Text strong style={{ fontSize: 14 }}>{person.name}</Text>
                    )}
                    <Space size={4}>
                      {isEditing ? (
                        <>
                          <Button size="small" icon={<CheckOutlined />}
                            style={{ color: '#fff', background: '#52c41a', borderColor: '#52c41a' }}
                            onClick={() => confirmPersonEdit(person.id!)} />
                          <Button size="small" icon={<CloseOutlined />} onClick={cancelPersonEdit} />
                        </>
                      ) : (
                        <>
                          <Button size="small" icon={<EditOutlined />} onClick={() => startPersonEdit(person)} />
                          <Popconfirm title="Delete person and all their POs?" onConfirm={() => deletePerson(person.id!)}>
                            <Button size="small" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        </>
                      )}
                    </Space>
                  </div>
                }
              >
                {/* Person fields */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Company</div>
                    {isEditing ? (
                      <Select
                        size="small" value={inlinePersonVals.company_id}
                        options={compOpts} style={{ width: 150 }} allowClear
                        onChange={v => setInlinePersonVals(prev => ({ ...prev, company_id: v ?? null }))}
                      />
                    ) : (
                      person.company_id ? <Tag>{companyName(person.company_id)}</Tag> : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Position</div>
                    {isEditing ? (
                      <Input size="small" value={inlinePersonVals.position} style={{ width: 130 }}
                        onChange={e => setInlinePersonVals(v => ({ ...v, position: e.target.value }))} />
                    ) : (
                      <Text style={{ fontSize: 13 }}>{person.position || '—'}</Text>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Country</div>
                    {isEditing ? (
                      <Input size="small" value={inlinePersonVals.country} style={{ width: 90 }}
                        onChange={e => setInlinePersonVals(v => ({ ...v, country: e.target.value }))} />
                    ) : (
                      <Text style={{ fontSize: 13 }}>{person.country || '—'}</Text>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Rate Type</div>
                    {isEditing ? (
                      <Select size="small" value={inlinePersonVals.rate_type}
                        options={[{ value: 'month', label: 'Monthly' }, { value: 'hour', label: 'Hourly' }, { value: 'fixed', label: 'Fixed' }]}
                        style={{ width: 100 }}
                        onChange={v => setInlinePersonVals(prev => ({ ...prev, rate_type: v as RateType }))}
                      />
                    ) : (
                      <Tag color={rateColor}>{person.rate_type}</Tag>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Rate</div>
                    {isEditing ? (
                      <InputNumber size="small" value={inlinePersonVals.rate} min={0} style={{ width: 100 }}
                        onChange={v => setInlinePersonVals(prev => ({ ...prev, rate: v ?? 0 }))} />
                    ) : (
                      <Text style={{ fontSize: 13, fontWeight: 700 }}>{fmt(person.rate)}</Text>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Allocation %</div>
                    {isEditing ? (
                      <InputNumber size="small" value={inlinePersonVals.allocation} min={0} max={100} style={{ width: 80 }}
                        onChange={v => setInlinePersonVals(prev => ({ ...prev, allocation: v ?? 100 }))} />
                    ) : (
                      <Text style={{ fontSize: 13 }}>{person.allocation ?? 100}%</Text>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Year</div>
                    {isEditing ? (
                      <Select size="small" value={inlinePersonVals.year}
                        options={yearOpts} style={{ width: 90 }}
                        onChange={v => setInlinePersonVals(prev => ({ ...prev, year: v }))} />
                    ) : (
                      <Tag color="blue" style={{ fontSize: 12 }}>{person.year}</Tag>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div style={{ display: 'flex', gap: 20, marginBottom: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Total Expected</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1677ff' }}>{fmt(totalExp)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Total Prevision</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#722ed1' }}>{fmt(totalPrev)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Total Actual</div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{fmt(totalAct)}</div>
                  </div>
                  {totalExp > 0 && (
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#722ed1', marginBottom: 1 }}>
                        <span>Prevision</span><span>{prevPct.toFixed(0)}%</span>
                      </div>
                      <Progress percent={Math.min(prevPct, 100)} size="small" strokeColor="#722ed1" showInfo={false} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#1677ff', marginBottom: 1, marginTop: 4 }}>
                        <span>Actual</span><span>{actPct.toFixed(0)}%</span>
                      </div>
                      <Progress percent={Math.min(actPct, 100)} size="small" strokeColor="#1677ff" showInfo={false} />
                    </div>
                  )}
                </div>

                {/* POs header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={{ fontSize: 12, color: '#666', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Purchase Orders</Text>
                  <Button size="small" icon={<PlusOutlined />} onClick={() => openAddPO(person.id!)}>Add PO</Button>
                </div>

                {/* PO rows */}
                {pPOs.length === 0 ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>No POs yet.</Text>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {pPOs.map(po => {
                      const isEditingPO = inlinePOId === po.id
                      const inlinePerson = people.find(p => p.id === inlinePOPersonId)

                      if (isEditingPO && inlinePerson) {
                        const liveExp = inlinePerson.rate_type === 'fixed'
                          ? inlinePOFixedExp
                          : calcPOExpected(inlinePerson, {
                              month_start: inlinePOVals.month_start,
                              month_end: inlinePOVals.month_end,
                              monthly_hours: inlinePOVals.monthly_hours,
                              monthly_expected: inlinePOFixedExp,
                            })
                        return (
                          <div key={po.id} style={{ background: '#f0f7ff', border: '1px solid #d6e8ff', borderRadius: 6, padding: '10px 10px 8px' }}>
                            {/* Controls row 1 */}
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
                              <Select
                                value={inlinePOVals.project_id}
                                options={projects.map(p => ({ value: p.id, label: `${p.project_number} ${p.name}` }))}
                                size="small" style={{ flex: 1, minWidth: 150 }}
                                onChange={v => setInlinePOVals(prev => ({ ...prev, project_id: v }))}
                              />
                              <Select
                                value={inlinePOVals.team_id}
                                options={[{ value: null, label: '— None —' }, ...teams.map(t => ({ value: t.id, label: t.name }))]}
                                size="small" style={{ width: 130 }} allowClear
                                onChange={v => setInlinePOVals(prev => ({ ...prev, team_id: v ?? null }))}
                              />
                              <Select
                                value={inlinePOVals.status}
                                options={[{ value: 'draft', label: 'Draft' }, { value: 'open', label: 'Open' }, { value: 'complete', label: 'Complete' }]}
                                size="small" style={{ width: 100 }}
                                onChange={v => setInlinePOVals(prev => ({ ...prev, status: v as POStatus }))}
                              />
                              <Select
                                value={inlinePOVals.month_start}
                                options={monthOpts} size="small" style={{ width: 80 }}
                                onChange={v => { setInlinePOVals(prev => ({ ...prev, month_start: v })); inlinePORecalcTotalPo() }}
                              />
                              <span style={{ fontSize: 12, color: '#888' }}>–</span>
                              <Select
                                value={inlinePOVals.month_end}
                                options={monthOpts} size="small" style={{ width: 80 }}
                                onChange={v => { setInlinePOVals(prev => ({ ...prev, month_end: v })); inlinePORecalcTotalPo() }}
                              />
                              {inlinePerson.rate_type === 'hour' && (
                                <InputNumber
                                  value={inlinePOTotalHours} min={0} size="small" style={{ width: 90 }}
                                  placeholder="Total hrs"
                                  onChange={v => {
                                    const total = v ?? 0
                                    setInlinePOTotalHours(total)
                                    setInlinePOVals(prev => ({
                                      ...prev,
                                      monthly_hours: distributeHours(total, prev.month_start, prev.month_end),
                                    }))
                                  }}
                                />
                              )}
                              <InputNumber
                                value={inlinePOVals.total_po} min={0} size="small" style={{ width: 110 }}
                                disabled={inlinePerson.rate_type === 'month'}
                                placeholder="Total PO"
                                onChange={v => {
                                  if (skipInlinePoChange.current) { skipInlinePoChange.current = false; return }
                                  const newPo = v ?? 0
                                  if (inlinePerson.rate_type === 'fixed') {
                                    const n = Math.max(1, inlinePOVals.month_end - inlinePOVals.month_start + 1)
                                    setInlinePOFixedExp(Array.from({ length: 12 }, (_, i) =>
                                      (i + 1 >= inlinePOVals.month_start && i + 1 <= inlinePOVals.month_end)
                                        ? Math.round(newPo / n * 100) / 100 : 0
                                    ))
                                  }
                                  setInlinePOVals(prev => ({ ...prev, total_po: newPo }))
                                }}
                              />
                              <Button size="small" icon={<CheckOutlined />}
                                style={{ color: '#fff', background: '#52c41a', borderColor: '#52c41a' }}
                                onClick={() => confirmPOEdit(po.id!)} />
                              <Button size="small" icon={<CloseOutlined />} onClick={cancelPOEdit} />
                            </div>
                            {/* Controls row 2: PR#, PO#, Comments */}
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                              <Input
                                value={inlinePOVals.pr_number} size="small" style={{ width: 110 }} placeholder="PR#"
                                onChange={e => setInlinePOVals(prev => ({ ...prev, pr_number: e.target.value }))} />
                              <Input
                                value={inlinePOVals.po_number} size="small" style={{ width: 110 }} placeholder="PO#"
                                onChange={e => setInlinePOVals(prev => ({ ...prev, po_number: e.target.value }))} />
                              <Input
                                value={inlinePOVals.comments} size="small" style={{ flex: 1, minWidth: 150 }} placeholder="Comments"
                                onChange={e => setInlinePOVals(prev => ({ ...prev, comments: e.target.value }))} />
                            </div>
                            {/* Monthly grid */}
                            <MonthlyGrid
                              expected={liveExp}
                              actual={inlinePOVals.monthly_actual}
                              nullableActual
                              onActualChange={(i, v) => setInlinePOVals(prev => {
                                const act = [...prev.monthly_actual]; act[i] = v; return { ...prev, monthly_actual: act }
                              })}
                              onConfirmActual={i => setInlinePOVals(prev => {
                                const act = [...prev.monthly_actual]; act[i] = liveExp[i]; return { ...prev, monthly_actual: act }
                              })}
                              showHours={inlinePerson.rate_type === 'hour'}
                              hours={inlinePOVals.monthly_hours}
                              onHoursChange={(i, v) => setInlinePOVals(prev => {
                                const hrs = [...prev.monthly_hours]; hrs[i] = v; return { ...prev, monthly_hours: hrs }
                              })}
                              activeRange={{ start: inlinePOVals.month_start, end: inlinePOVals.month_end }}
                            />
                          </div>
                        )
                      }

                      // Read mode
                      const poExp = calcPOExpected(person, po)
                      const poExpTotal = sumArr(calcPOForecast(person, po))
                      const poActTotal = sumArr(po.monthly_actual || [])
                      const poPrevTotal = calcPOPrevision(person, po)
                      const isExpanded = expandedPOs.has(po.id!)
                      const statusColor = po.status === 'complete' ? 'success' : po.status === 'open' ? 'processing' : 'default'
                      const proj = po.project_id ? projects.find(p => p.id === po.project_id) : null
                      const projName = proj ? `${proj.project_number} ${proj.name}` : '—'
                      const projYear = proj?.year
                      return (
                        <div key={po.id} style={{ background: '#fafafa', borderRadius: 4, padding: '6px 8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, flexWrap: 'wrap' }}>
                            <Button
                              size="small" type="text"
                              icon={isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                              onClick={() => togglePO(po.id!)}
                              style={{ width: 20, padding: 0, flexShrink: 0, color: '#888' }}
                            />
                            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                              <span style={{ fontWeight: 600 }}>{projName}</span>
                              {po.team_id && <span style={{ color: '#888' }}> · {teamName(po.team_id)}</span>}
                            </div>
                            {projYear && <Tag style={{ margin: 0, flexShrink: 0, fontSize: 11 }}>{projYear}</Tag>}
                            {po.pr_number && <span style={{ color: '#888', flexShrink: 0 }}>PR {po.pr_number}</span>}
                            {po.po_number && <span style={{ color: '#888', flexShrink: 0 }}>PO {po.po_number}</span>}
                            <Tag color={statusColor} style={{ margin: 0, flexShrink: 0 }}>{po.status}</Tag>
                            <span style={{ color: '#555', flexShrink: 0 }}>{MONTHS[(po.month_start || 1) - 1]}–{MONTHS[(po.month_end || 12) - 1]}</span>
                            <span style={{ color: '#1677ff', fontWeight: 700, flexShrink: 0 }}>{fmt(po.total_po)}</span>
                            {poExpTotal > 0 && <span style={{ color: '#722ed1', flexShrink: 0, fontSize: 11 }}>Prev: {fmt(poPrevTotal)}</span>}
                            {poExpTotal > 0 && <span style={{ color: '#888', flexShrink: 0, fontSize: 11 }}>Act: {fmt(poActTotal)}</span>}
                            <Space size={2} style={{ flexShrink: 0 }}>
                              <Button size="small" icon={<EditOutlined />} onClick={() => startPOEdit(po)} />
                              <Popconfirm title="Delete PO?" onConfirm={() => deletePO(po.id!)}>
                                <Button size="small" danger icon={<DeleteOutlined />} />
                              </Popconfirm>
                            </Space>
                          </div>
                          {isExpanded && (
                            <div style={{ marginTop: 8 }}>
                              <MonthlyGrid
                                expected={poExp}
                                actual={po.monthly_actual || NULL12()}
                                disableActual
                                showHours={person.rate_type === 'hour'}
                                hours={po.monthly_hours || ZERO12()}
                                disableHours
                                activeRange={{ start: po.month_start, end: po.month_end }}
                              />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            </Col>
          )
        })}
        {people.length === 0 && (
          <Col span={24}><Text type="secondary">No external people yet — click "Add Person" to get started.</Text></Col>
        )}
      </Row>

      {/* Add person modal */}
      <Modal open={addPersonOpen} title="Add External Person" onOk={saveAddPerson} onCancel={() => setAddPersonOpen(false)} destroyOnClose width={400}>
        <Form form={addPersonForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item name="company_id" label="Company" initialValue={null}>
            <Select options={compOpts} allowClear />
          </Form.Item>
          <Form.Item name="position" label="Position" initialValue="">
            <Input />
          </Form.Item>
          <Form.Item name="country" label="Country" initialValue="">
            <Input />
          </Form.Item>
          <Form.Item name="rate_type" label="Rate Type" rules={[{ required: true }]} initialValue="month">
            <Select options={[{ value: 'month', label: 'Monthly Rate' }, { value: 'hour', label: 'Hourly Rate' }, { value: 'fixed', label: 'Fixed Price' }]} />
          </Form.Item>
          <Form.Item name="rate" label="Rate" rules={[{ required: true }]} initialValue={0}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="allocation" label="Allocation %" initialValue={100}>
            <InputNumber style={{ width: '100%' }} min={0} max={100} />
          </Form.Item>
          <Form.Item name="year" label="Year" rules={[{ required: true }]}>
            <Select options={yearOpts} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Add PO drawer */}
      <Drawer open={poDrawerOpen}
        title={`Add PO — ${people.find(p => p.id === poDrawerPersonId)?.name ?? ''}`}
        width={960} onClose={() => setPoDrawerOpen(false)}
        extra={<Button type="primary" onClick={savePO}>Save</Button>}
        destroyOnClose>
        <Form form={poForm} layout="vertical" onValuesChange={onPoFormValuesChange}>
          <Space wrap style={{ width: '100%' }}>
            <Form.Item name="project_id" label="Project" rules={[{ required: true, message: 'Project is required' }]}>
              <Select options={projects.map(p => ({ value: p.id, label: `${p.project_number} ${p.name}` }))} style={{ width: 220 }} />
            </Form.Item>
            <Form.Item name="team_id" label="Team">
              <Select options={[{ value: null, label: '— None —' }, ...teams.map(t => ({ value: t.id, label: t.name }))]}
                style={{ width: 180 }} allowClear />
            </Form.Item>
            <Form.Item name="status" label="Status">
              <Select options={[{ value: 'draft', label: 'Draft' }, { value: 'open', label: 'Open' }, { value: 'complete', label: 'Complete' }]}
                style={{ width: 120 }} />
            </Form.Item>
          </Space>

          <Space wrap style={{ width: '100%' }}>
            <Form.Item name="pr_number" label="PR Number"><Input style={{ width: 120 }} /></Form.Item>
            <Form.Item name="po_number" label="PO Number"><Input style={{ width: 120 }} /></Form.Item>
          </Space>

          <Space wrap style={{ width: '100%' }}>
            <Form.Item name="month_start" label="Month Start" rules={[{ required: true }]}>
              <Select options={monthOpts} style={{ width: 110 }} />
            </Form.Item>
            <Form.Item name="month_end" label="Month End" rules={[{ required: true }]}>
              <Select options={monthOpts} style={{ width: 110 }} />
            </Form.Item>
            {drawerRateType === 'hour' && (
              <Form.Item label="Total Hours">
                <InputNumber value={totalHours} min={0} style={{ width: 130 }} onChange={onTotalHoursChange} />
              </Form.Item>
            )}
            <Form.Item name="total_po" label="Total PO"
              tooltip={drawerRateType === 'month' ? 'Auto-calculated from rate × allocation × months.' : 'Enter the total amount.'}>
              <InputNumber style={{ width: 140 }} min={0} disabled={drawerRateType === 'month'} />
            </Form.Item>
          </Space>

          <Form.Item name="comments" label="Comments">
            <Input.TextArea rows={2} />
          </Form.Item>

          {drawerPerson && (
            <div style={{ marginBottom: 12, fontSize: 12, color: '#888' }}>
              Person: <Tag color={drawerRateColor}>{drawerPerson.rate_type}</Tag>
              {drawerPerson.rate_type !== 'fixed' && <span>Rate: <b>{fmt(drawerPerson.rate)}</b></span>}
              {drawerPerson.rate_type === 'month' && <span style={{ marginLeft: 8 }}>Allocation: <b>{drawerPerson.allocation}%</b></span>}
            </div>
          )}

          <Divider orientation="left">Monthly Data</Divider>
          <MonthlyGrid
            expected={drawerLiveExpected}
            actual={drawerRateType === 'hour' ? drawerLiveHourlyActual.map(v => v as number | null) : monthlyActual}
            onActualChange={drawerRateType === 'hour' ? undefined : (i, v) => setMonthlyActual(prev => { const a = [...prev]; a[i] = v; return a })}
            onConfirmActual={drawerRateType === 'hour' || formStatus === 'draft' ? undefined : i => {
              setMonthlyActual(prev => { const a = [...prev]; a[i] = drawerLiveExpected[i]; return a })
            }}
            nullableActual
            showHours={drawerRateType === 'hour'}
            hours={monthlyHours}
            onHoursChange={(i, v) => setMonthlyHours(prev => { const a = [...prev]; a[i] = v; return a })}
            disableActual={drawerRateType === 'hour' || formStatus === 'draft'}
            activeRange={{ start: monthStart, end: monthEnd }}
          />
        </Form>
      </Drawer>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal Resources Tab  (people → allocations model, card layout)
// ─────────────────────────────────────────────────────────────────────────────

function InternalTab({ projects, teams, year }: { projects: Project[]; companies: Company[]; teams: Team[]; year: number }) {
  const [people, setPeople]           = useState<InternalPerson[]>([])
  const [allocations, setAllocations] = useState<InternalAllocation[]>([])

  // Inline person editing
  const [inlineEditId, setInlineEditId]   = useState<number | null>(null)
  const [inlineValues, setInlineValues]   = useState({ name: '', price_per_hour: 0, total_hours: 0, year: new Date().getFullYear() })

  // Add person modal
  const [addOpen, setAddOpen] = useState(false)
  const [addForm]             = Form.useForm()

  // Add-allocation drawer
  const [allocOpen, setAllocOpen]         = useState(false)
  const [allocPersonId, setAllocPersonId] = useState<number | null>(null)
  const [allocPph, setAllocPph]           = useState(0)
  const [allocTotalHours, setAllocTotalHours] = useState(0)
  const [allocDedPct, setAllocDedPct]     = useState(100)
  const [allocForm]                       = Form.useForm()
  const [monthlyHours, setMonthlyHours]   = useState<number[]>(ZERO12())
  const [monthlyActual, setMonthlyActual] = useState<(number | null)[]>(NULL12())

  // Inline allocation editing
  const [inlineAllocId, setInlineAllocId]     = useState<number | null>(null)
  const [inlineAllocVals, setInlineAllocVals] = useState({
    project_id:    null as number | null,
    team_id:       null as number | null,
    dedication_pct: 100,
    monthly_hours:  ZERO12() as number[],
    monthly_actual: NULL12() as (number | null)[],
  })
  const [inlineAllocPph, setInlineAllocPph]       = useState(0)
  const [inlineAllocTotalH, setInlineAllocTotalH] = useState(0)

  const [expandedAllocs, setExpandedAllocs] = useState<Set<number>>(new Set())
  const toggleAlloc = (id: number) => setExpandedAllocs(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })

  const load = async () => {
    const [p, a] = await Promise.all([api.people.list(), api.allocations.list()])
    setPeople(p); setAllocations(a)
  }
  useEffect(() => { load() }, [])

  const projectIds = new Set(projects.map(p => p.id))
  const personAllocs = (personId: number) => allocations.filter(a => a.person_id === personId && (a.project_id === null || projectIds.has(a.project_id)))
  const personAllocatedHours = (personId: number) =>
    personAllocs(personId).reduce((s, a) => s + sumArr(a.monthly_hours || []), 0)

  const allocPrevision = (a: InternalAllocation, pph: number): number => {
    const exp = calcAllocationExpected(a, pph)
    return exp.reduce((s, e, i) => {
      const act = (a.monthly_actual || [])[i]
      return s + (act !== null && act !== undefined ? act : e)
    }, 0)
  }
  const personTotalPrevision = (person: InternalPerson) =>
    personAllocs(person.id!).reduce((s, a) => s + allocPrevision(a, person.price_per_hour), 0)

  const distributeHours = (totalH: number, pct: number): number[] => {
    const perMonth = Math.round(totalH * pct / 100 / 12 * 10) / 10
    return Array(12).fill(perMonth)
  }

  // ── Inline editing ───────────────────────────────────────────────────────────
  const startEdit = (p: InternalPerson) => {
    setInlineEditId(p.id!)
    setInlineValues({ name: p.name, price_per_hour: p.price_per_hour, total_hours: p.total_hours ?? 0, year: p.year })
  }
  const cancelEdit = () => setInlineEditId(null)
  const confirmEdit = async (personId: number) => {
    await api.people.upsert({ id: personId, ...inlineValues } as InternalPerson)
    setInlineEditId(null); load()
  }
  const deletePerson = async (id: number) => { await api.people.delete(id); load() }

  // ── Add person modal ─────────────────────────────────────────────────────────
  const openAdd = () => { addForm.resetFields(); addForm.setFieldsValue({ year }); setAddOpen(true) }
  const saveAdd = async () => {
    let vals: Record<string, unknown>
    try { vals = await addForm.validateFields() } catch { return }
    await api.people.upsert(vals as InternalPerson)
    setAddOpen(false); load()
  }

  // ── Add-allocation drawer ────────────────────────────────────────────────────
  const openAddAlloc = (personId: number, pph: number, totalH: number) => {
    setAllocPersonId(personId); setAllocPph(pph)
    setAllocTotalHours(totalH); setAllocDedPct(100)
    setMonthlyHours(distributeHours(totalH, 100)); setMonthlyActual(NULL12())
    allocForm.resetFields(); allocForm.setFieldsValue({ dedication_pct: 100 })
    setAllocOpen(true)
  }
  const saveAlloc = async () => {
    let vals: Record<string, unknown>
    try { vals = await allocForm.validateFields() } catch { return }
    await api.allocations.upsert({
      ...vals,
      person_id: allocPersonId!,
      monthly_hours: monthlyHours,
      monthly_actual: monthlyActual,
    } as InternalAllocation)
    setAllocOpen(false); load()
  }
  const deleteAlloc = async (id: number) => { await api.allocations.delete(id); load() }

  const onAllocFormChange = (changed: Record<string, unknown>) => {
    if ('dedication_pct' in changed) {
      const pct = (changed.dedication_pct as number) ?? 0
      setAllocDedPct(pct)
      if (allocTotalHours > 0) setMonthlyHours(distributeHours(allocTotalHours, pct))
    }
  }

  // ── Inline allocation editing ────────────────────────────────────────────────
  const startAllocEdit = (a: InternalAllocation, pph: number, totalH: number) => {
    setInlineAllocId(a.id!)
    setInlineAllocPph(pph)
    setInlineAllocTotalH(totalH)
    setInlineAllocVals({
      project_id:    a.project_id,
      team_id:       a.team_id,
      dedication_pct: a.dedication_pct ?? 100,
      monthly_hours:  [...(a.monthly_hours  || ZERO12())],
      monthly_actual: [...(a.monthly_actual || NULL12())],
    })
  }
  const cancelAllocEdit = () => setInlineAllocId(null)
  const confirmAllocEdit = async (allocId: number, personId: number) => {
    await api.allocations.upsert({ id: allocId, person_id: personId, ...inlineAllocVals } as InternalAllocation)
    setInlineAllocId(null); load()
  }

  const projectName = (id: number | null) => id ? projects.find(p => p.id === id)?.name || '—' : '—'
  const teamName    = (id: number | null) => id ? teams.find(t => t.id === id)?.name || '—' : '—'
  const yearOpts    = Array.from({ length: 10 }, (_, i) => { const y = new Date().getFullYear() - 2 + i; return { value: y, label: String(y) } })
  const liveExpected = monthlyHours.map(h => h * allocPph)

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Add Person</Button>
      </div>

      <Row gutter={[16, 16]}>
        {people.filter(p => p.year === year).map(person => {
          const isEditing = inlineEditId === person.id
          const allocs = personAllocs(person.id!)
          const allocatedH = personAllocatedHours(person.id!)
          const pph = isEditing ? inlineValues.price_per_hour : person.price_per_hour
          const totalExp    = personAllocs(person.id!).reduce((s, a) => s + sumArr(calcAllocationExpected(a, pph)), 0)
          const totalPrev   = personTotalPrevision(person)
          const totalActual = personAllocs(person.id!).reduce((s, a) => s + sumArr(a.monthly_actual || []), 0)
          const overAllocated = allocatedH > (person.total_hours || 0) && (person.total_hours || 0) > 0
          return (
            <Col xs={24} md={12} key={person.id}>
              <Card
                size="small"
                style={{ height: '100%' }}
                title={
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    {isEditing ? (
                      <Input
                        value={inlineValues.name}
                        onChange={e => setInlineValues(v => ({ ...v, name: e.target.value }))}
                        size="small"
                        style={{ flex: 1, fontWeight: 600 }}
                        autoFocus
                        onPressEnter={() => confirmEdit(person.id!)}
                      />
                    ) : (
                      <Text strong style={{ fontSize: 14 }}>{person.name}</Text>
                    )}
                    <Space size={4}>
                      {isEditing ? (
                        <>
                          <Button
                            size="small"
                            icon={<CheckOutlined />}
                            style={{ color: '#fff', background: '#52c41a', borderColor: '#52c41a' }}
                            onClick={() => confirmEdit(person.id!)}
                          />
                          <Button size="small" icon={<CloseOutlined />} onClick={cancelEdit} />
                        </>
                      ) : (
                        <>
                          <Button size="small" icon={<EditOutlined />} onClick={() => startEdit(person)} />
                          <Popconfirm title="Delete person and all their allocations?" onConfirm={() => deletePerson(person.id!)}>
                            <Button size="small" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        </>
                      )}
                    </Space>
                  </div>
                }
              >
                {/* Stats row */}
                <div style={{ display: 'flex', gap: 20, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Price / Hour</div>
                    {isEditing ? (
                      <InputNumber
                        size="small"
                        value={inlineValues.price_per_hour}
                        min={0}
                        style={{ width: 100 }}
                        onChange={v => setInlineValues(prev => ({ ...prev, price_per_hour: v ?? 0 }))}
                      />
                    ) : (
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{fmt(person.price_per_hour)}</div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Total Hours</div>
                    {isEditing ? (
                      <InputNumber
                        size="small"
                        value={inlineValues.total_hours}
                        min={0}
                        style={{ width: 90 }}
                        onChange={v => setInlineValues(prev => ({ ...prev, total_hours: v ?? 0 }))}
                      />
                    ) : (
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{person.total_hours ?? 0} h</div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Allocated</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: overAllocated ? '#ff4d4f' : undefined }}>
                      {allocatedH.toFixed(1)} h
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Year</div>
                    {isEditing ? (
                      <Select size="small" value={inlineValues.year}
                        options={yearOpts} style={{ width: 90 }}
                        onChange={v => setInlineValues(prev => ({ ...prev, year: v }))} />
                    ) : (
                      <Tag color="blue" style={{ fontSize: 12 }}>{person.year}</Tag>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Total Expected</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1677ff' }}>{fmt(totalExp)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Total Prevision</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#722ed1' }}>{fmt(totalPrev)}</div>
                  </div>
                  {totalExp > 0 && (
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#722ed1', marginBottom: 1 }}>
                        <span>Prevision</span><span>{(totalPrev / totalExp * 100).toFixed(0)}%</span>
                      </div>
                      <Progress percent={Math.min(totalPrev / totalExp * 100, 100)} size="small" strokeColor="#722ed1" showInfo={false} style={{ marginBottom: 4 }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#1677ff', marginBottom: 1 }}>
                        <span>Actual</span><span>{(totalActual / totalExp * 100).toFixed(0)}%</span>
                      </div>
                      <Progress percent={Math.min(totalActual / totalExp * 100, 100)} size="small" strokeColor="#1677ff" showInfo={false} />
                    </div>
                  )}
                </div>

                {/* Allocations header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={{ fontSize: 12, color: '#666', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Allocations</Text>
                  <Button size="small" icon={<PlusOutlined />}
                    onClick={() => openAddAlloc(person.id!, person.price_per_hour, person.total_hours ?? 0)}>
                    Add
                  </Button>
                </div>

                {/* Allocation rows */}
                {allocs.length === 0 ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>No allocations yet.</Text>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {allocs.map(a => {
                      const isEditingAlloc = inlineAllocId === a.id
                      if (isEditingAlloc) {
                        const liveExp = inlineAllocVals.monthly_hours.map(h => h * inlineAllocPph)
                        return (
                          <div key={a.id} style={{ background: '#f0f7ff', border: '1px solid #d6e8ff', borderRadius: 6, padding: '10px 10px 8px' }}>
                            {/* Controls */}
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                              <Select
                                value={inlineAllocVals.project_id}
                                options={projects.map(p => ({ value: p.id, label: `${p.project_number} ${p.name}` }))}
                                size="small"
                                style={{ flex: 1, minWidth: 150 }}
                                onChange={v => setInlineAllocVals(prev => ({ ...prev, project_id: v }))}
                              />
                              <Select
                                value={inlineAllocVals.team_id}
                                options={[{ value: null, label: '— None —' }, ...teams.map(t => ({ value: t.id, label: t.name }))]}
                                size="small"
                                style={{ width: 130 }}
                                allowClear
                                onChange={v => setInlineAllocVals(prev => ({ ...prev, team_id: v ?? null }))}
                              />
                              <InputNumber
                                value={inlineAllocVals.dedication_pct}
                                min={0} max={100}
                                size="small"
                                style={{ width: 75 }}
                                formatter={v => `${v}%`}
                                parser={v => Number(String(v).replace('%', ''))}
                                onChange={v => {
                                  const pct = v ?? 0
                                  setInlineAllocVals(prev => ({
                                    ...prev,
                                    dedication_pct: pct,
                                    ...(inlineAllocTotalH > 0 ? { monthly_hours: distributeHours(inlineAllocTotalH, pct) } : {}),
                                  }))
                                }}
                              />
                              <Button size="small" icon={<CheckOutlined />}
                                style={{ color: '#fff', background: '#52c41a', borderColor: '#52c41a' }}
                                onClick={() => confirmAllocEdit(a.id!, person.id!)}
                              />
                              <Button size="small" icon={<CloseOutlined />} onClick={cancelAllocEdit} />
                            </div>
                            {/* Monthly grid */}
                            <MonthlyGrid
                              expected={liveExp}
                              actual={inlineAllocVals.monthly_actual}
                              nullableActual
                              onActualChange={(i, v) => setInlineAllocVals(prev => {
                                const act = [...prev.monthly_actual]; act[i] = v; return { ...prev, monthly_actual: act }
                              })}
                              onConfirmActual={i => setInlineAllocVals(prev => {
                                const act = [...prev.monthly_actual]; act[i] = liveExp[i]; return { ...prev, monthly_actual: act }
                              })}
                              showHours
                              hours={inlineAllocVals.monthly_hours}
                              onHoursChange={(i, v) => setInlineAllocVals(prev => {
                                const hrs = [...prev.monthly_hours]; hrs[i] = v; return { ...prev, monthly_hours: hrs }
                              })}
                            />
                          </div>
                        )
                      }
                      const aHours   = sumArr(a.monthly_hours || [])
                      const aExp     = sumArr(calcAllocationExpected(a, person.price_per_hour))
                      const aPrev    = allocPrevision(a, person.price_per_hour)
                      const allocYear = a.project_id ? projects.find(p => p.id === a.project_id)?.year : null
                      const isExpanded = expandedAllocs.has(a.id!)
                      return (
                        <div key={a.id} style={{ background: '#fafafa', borderRadius: 4, padding: '6px 8px' }}>
                          {/* Summary line */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: isExpanded ? 6 : 0 }}>
                            <Button
                              size="small" type="text"
                              icon={isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                              onClick={() => toggleAlloc(a.id!)}
                              style={{ width: 20, padding: 0, flexShrink: 0, color: '#888' }}
                            />
                            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                              <span style={{ fontWeight: 600 }}>{projectName(a.project_id)}</span>
                              {a.team_id && <span style={{ color: '#888' }}> · {teamName(a.team_id)}</span>}
                            </div>
                            {allocYear && <Tag style={{ margin: 0, fontSize: 11, flexShrink: 0 }}>{allocYear}</Tag>}
                            <Tag color="blue" style={{ margin: 0, fontSize: 11, flexShrink: 0 }}>{a.dedication_pct ?? 100}%</Tag>
                            <span style={{ color: '#555', whiteSpace: 'nowrap', flexShrink: 0 }}>{aHours.toFixed(1)} h</span>
                            <span style={{ color: '#1677ff', whiteSpace: 'nowrap', flexShrink: 0 }}>Exp: {fmt(aExp)}</span>
                            <span style={{ color: '#722ed1', whiteSpace: 'nowrap', flexShrink: 0 }}>Prev: {fmt(aPrev)}</span>
                            <Space size={2} style={{ flexShrink: 0 }}>
                              <Button size="small" icon={<EditOutlined />}
                                onClick={() => startAllocEdit(a, person.price_per_hour, person.total_hours ?? 0)} />
                              <Popconfirm title="Delete allocation?" onConfirm={() => deleteAlloc(a.id!)}>
                                <Button size="small" danger icon={<DeleteOutlined />} />
                              </Popconfirm>
                            </Space>
                          </div>
                          {/* Read-only monthly grid — shown when expanded */}
                          {isExpanded && (
                            <MonthlyGrid
                              expected={calcAllocationExpected(a, person.price_per_hour)}
                              actual={a.monthly_actual || NULL12()}
                              showExpected={false}
                              showHours
                              hours={a.monthly_hours || ZERO12()}
                              disableHours
                              disableActual
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            </Col>
          )
        })}
        {people.length === 0 && (
          <Col span={24}><Text type="secondary">No people yet — click "Add Person" to get started.</Text></Col>
        )}
      </Row>

      {/* Add person modal */}
      <Modal open={addOpen} title="Add Person" onOk={saveAdd} onCancel={() => setAddOpen(false)} destroyOnClose width={360}>
        <Form form={addForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item name="price_per_hour" label="Price / Hour" rules={[{ required: true }]} initialValue={0}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="total_hours" label="Total Hours / Year" rules={[{ required: true }]} initialValue={0}
            tooltip="Annual hours for this person — allocation % will distribute these across months.">
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="year" label="Year" rules={[{ required: true }]}>
            <Select options={yearOpts} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Allocation drawer (add only) */}
      <Drawer open={allocOpen}
        title={`Add Allocation — ${people.find(p => p.id === allocPersonId)?.name ?? ''}`}
        width={960} onClose={() => setAllocOpen(false)}
        extra={<Button type="primary" onClick={saveAlloc}>Save</Button>}
        destroyOnClose>
        <Form form={allocForm} layout="vertical" onValuesChange={onAllocFormChange}>
          <Space wrap style={{ width: '100%' }}>
            <Form.Item name="project_id" label="Project" rules={[{ required: true }]}>
              <Select options={projects.map(p => ({ value: p.id, label: `${p.project_number} ${p.name}` }))}
                style={{ width: 220 }} />
            </Form.Item>
            <Form.Item name="team_id" label="Team">
              <Select options={[{ value: null, label: '— None —' }, ...teams.map(t => ({ value: t.id, label: t.name }))]}
                style={{ width: 180 }} allowClear />
            </Form.Item>
            <Form.Item name="dedication_pct" label="Dedication %">
              <InputNumber style={{ width: 120 }} min={0} max={100} />
            </Form.Item>
            {allocTotalHours > 0 && (
              <Form.Item label=" " colon={false}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  ≈ {Math.round(allocTotalHours * allocDedPct / 100)} h/year distributed across months
                </Text>
              </Form.Item>
            )}
          </Space>
          <Divider orientation="left">Monthly Hours &amp; Actuals</Divider>
          <MonthlyGrid
            expected={liveExpected}
            actual={monthlyActual}
            nullableActual
            onActualChange={(i, v) => setMonthlyActual(prev => { const a = [...prev]; a[i] = v; return a })}
            onConfirmActual={i => setMonthlyActual(prev => { const a = [...prev]; a[i] = liveExpected[i]; return a })}
            showHours
            hours={monthlyHours}
            onHoursChange={(i, v) => setMonthlyHours(prev => { const a = [...prev]; a[i] = v; return a })}
          />
        </Form>
      </Drawer>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Others Tab
// ─────────────────────────────────────────────────────────────────────────────

function OthersTab({ projects, companies, teams, year }: { projects: Project[]; companies: Company[]; teams: Team[]; year: number }) {
  const [data, setData] = useState<OtherResource[]>([])
  const [filterPid, setFilterPid] = useState<number | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<OtherResource | null>(null)
  const [form] = Form.useForm()
  const [monthlyExpected, setMonthlyExpected] = useState<number[]>(ZERO12())
  const [monthlyActual, setMonthlyActual] = useState<number[]>(ZERO12())
  const [formStatus, setFormStatus] = useState('draft')

  const load = () => api.others.list().then(setData)
  useEffect(() => { load() }, [])

  const projectIds = new Set(projects.map(p => p.id))
  const yearData = data.filter(r => projectIds.has(r.project_id))
  const displayed = filterPid ? yearData.filter(r => r.project_id === filterPid) : yearData
  const projectName = (id: number) => projects.find(p => p.id === id)?.name || '—'
  const companyName = (id: number | null) => companies.find(c => c.id === id)?.name || '—'
  const teamName = (id: number | null) => teams.find(t => t.id === id)?.name || '—'

  const openAdd = () => {
    setEditing(null)
    setMonthlyExpected(ZERO12()); setMonthlyActual(ZERO12())
    setFormStatus('draft')
    form.resetFields()
    form.setFieldsValue({ status: 'draft' })
    setOpen(true)
  }

  const openEdit = (r: OtherResource) => {
    setEditing(r)
    setMonthlyExpected([...(r.monthly_expected || ZERO12())])
    setMonthlyActual([...(r.monthly_actual || ZERO12())])
    setFormStatus(r.status || 'draft')
    form.setFieldsValue(r); setOpen(true)
  }

  const onSave = async () => {
    let vals: Record<string, unknown>
    try {
      vals = await form.validateFields()
    } catch {
      return
    }
    await api.others.upsert({
      ...vals,
      monthly_expected: monthlyExpected,
      monthly_actual: monthlyActual,
      ...(editing?.id ? { id: editing.id } : {}),
    })
    setOpen(false); load()
  }

  const onDelete = async (id: number) => { await api.others.delete(id); load() }

  const cols = [
    { title: 'Company', key: 'co', width: 110, render: (_: unknown, r: OtherResource) => companyName(r.company_id) },
    { title: 'Description', dataIndex: 'description', key: 'desc', width: 180 },
    { title: 'Project', key: 'proj', width: 130, render: (_: unknown, r: OtherResource) => projectName(r.project_id) },
    { title: 'Year', key: 'year', width: 70, render: (_: unknown, r: OtherResource) => {
      const y = projects.find(p => p.id === r.project_id)?.year
      return y ? <Tag color="blue">{y}</Tag> : '—'
    }},
    { title: 'Team', key: 'team', width: 110, render: (_: unknown, r: OtherResource) => teamName(r.team_id) },
    { title: 'PR#', dataIndex: 'pr_number', key: 'pr', width: 80 },
    { title: 'PO#', dataIndex: 'po_number', key: 'po', width: 80 },
    { title: 'Status', dataIndex: 'status', key: 'st', width: 80,
      render: (v: string) => <Tag color={v === 'complete' ? 'success' : v === 'open' ? 'processing' : 'default'}>{v || 'draft'}</Tag> },
    { title: 'Total Expected', key: 'texp', align: 'right' as const, width: 120,
      render: (_: unknown, r: OtherResource) => fmt(sumArr(r.monthly_expected || [])) },
    { title: 'Total Actual', key: 'tact', align: 'right' as const, width: 110,
      render: (_: unknown, r: OtherResource) => fmt(sumArr(r.monthly_actual || [])) },
    { title: '', key: 'actions', width: 80,
      render: (_: unknown, r: OtherResource) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="Delete resource?" onConfirm={() => onDelete(r.id!)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ]

  const projOpts = [{ value: null, label: '— All projects —' }, ...projects.map(p => ({ value: p.id, label: p.name }))]
  const compOpts = [{ value: null, label: 'None' }, ...companies.map(c => ({ value: c.id, label: c.name }))]
  const teamOpts = [{ value: null, label: 'None' }, ...teams.map(t => ({ value: t.id, label: t.name }))]

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <Select style={{ width: 220 }} options={projOpts} value={filterPid} onChange={setFilterPid} placeholder="Filter by project" allowClear />
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Add Other Cost</Button>
      </div>
      <Table dataSource={displayed} columns={cols} rowKey="id" size="small" pagination={false} />

      {(() => {
        const fd = !!editing && editing.status !== 'draft'
        const isComplete = editing?.status === 'complete'
        return (
          <Drawer open={open} title={editing ? 'Edit Other Cost' : 'Add Other Cost'}
            width={960} onClose={() => setOpen(false)}
            extra={!isComplete ? <Button type="primary" onClick={onSave}>Save</Button> : null}
            destroyOnClose>
            <Form form={form} layout="vertical"
              onValuesChange={(changed) => { if (changed.status !== undefined) setFormStatus(changed.status as string) }}>
              <Space wrap style={{ width: '100%' }}>
                <Form.Item name="project_id" label="Project" rules={[{ required: true }]}>
                  <Select options={projects.map(p => ({ value: p.id, label: p.name }))} style={{ width: 180 }} disabled={fd} />
                </Form.Item>
                <Form.Item name="team_id" label="Team">
                  <Select options={teamOpts} style={{ width: 160 }} disabled={fd} />
                </Form.Item>
                <Form.Item name="company_id" label="Company">
                  <Select options={compOpts} style={{ width: 160 }} disabled={fd} />
                </Form.Item>
                <Form.Item name="status" label="Status">
                  <Select options={[
                    { value: 'draft', label: 'Draft' },
                    { value: 'open', label: 'Open' },
                    { value: 'complete', label: 'Complete' },
                  ]} style={{ width: 120 }} disabled={isComplete} />
                </Form.Item>
              </Space>
              <Space wrap style={{ width: '100%' }}>
                <Form.Item name="pr_number" label="PR Number"><Input style={{ width: 130 }} disabled={fd} /></Form.Item>
                <Form.Item name="po_number" label="PO Number"><Input style={{ width: 130 }} disabled={fd} /></Form.Item>
              </Space>
              <Form.Item name="description" label="Description">
                <Input.TextArea rows={2} disabled={fd} />
              </Form.Item>
              <Divider orientation="left">Monthly Data</Divider>
              <MonthlyGrid
                expected={monthlyExpected}
                actual={monthlyActual}
                onExpectedChange={fd ? undefined : (i, v) => setMonthlyExpected(prev => { const a = [...prev]; a[i] = v; return a })}
                onActualChange={(i, v) => setMonthlyActual(prev => { const a = [...prev]; a[i] = v ?? 0; return a })}
                onConfirmActual={formStatus === 'draft' ? undefined : i => setMonthlyActual(prev => { const a = [...prev]; a[i] = monthlyExpected[i]; return a })}
                disableActual={isComplete || formStatus === 'draft'}
              />
            </Form>
          </Drawer>
        )
      })()}
    </>
  )
}
