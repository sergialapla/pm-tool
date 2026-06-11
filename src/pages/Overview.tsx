import { useEffect, useState } from 'react'
import { Typography, Progress, Row, Col, Card, Statistic, Tag, Select } from 'antd'
import { api } from '../utils/api'
import { fmt, sumArr, calcPOExpected, calcPOForecast, calcPOPrevision, calcAllocationExpected } from '../utils/format'
import type { Project, Team, ExternalPerson, ExternalPO, InternalPerson, InternalAllocation, OtherResource } from '../types'

const { Title, Text } = Typography

export default function Overview(): JSX.Element {
  const [projects, setProjects]       = useState<Project[]>([])
  const [teams, setTeams]             = useState<Team[]>([])
  const [extPeople, setExtPeople]     = useState<ExternalPerson[]>([])
  const [extPos, setExtPos]           = useState<ExternalPO[]>([])
  const [people, setPeople]           = useState<InternalPerson[]>([])
  const [allocations, setAllocations] = useState<InternalAllocation[]>([])
  const [others, setOthers]           = useState<OtherResource[]>([])
  const [year, setYear]               = useState<number>(new Date().getFullYear())
  const [teamFilter, setTeamFilter]     = useState<number | null>(null)
  const [projectFilter, setProjectFilter] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([
      api.projects.list(), api.teams.list(),
      api.extPeople.list(), api.extPos.list(), api.people.list(), api.allocations.list(), api.others.list(),
      api.settings.get(),
    ]).then(([p, t, ep, epo, ppl, alc, o, s]) => {
      setProjects(p); setTeams(t); setExtPeople(ep); setExtPos(epo); setPeople(ppl); setAllocations(alc); setOthers(o)
      setYear(Number((s as { active_year?: string }).active_year) || new Date().getFullYear())
    })
  }, [])

  const teamName = (id: number | null) => teams.find(t => t.id === id)?.name

  // Per-month prevision: use actual if entered (>0), else expected (for external/others)
  const prevision = (expected: number[], actual: (number | null)[]) =>
    expected.reduce((s, exp, i) => s + ((actual[i] || 0) > 0 ? (actual[i] || 0) : exp), 0)

  // Null-aware prevision for internal allocations: null = not entered, 0 = actual zero
  const previsionInt = (expected: number[], actual: (number | null)[]) =>
    expected.reduce((s, exp, i) => {
      const act = actual[i]
      return s + (act !== null && act !== undefined ? act : exp)
    }, 0)

  const pph = (personId: number) => people.find(p => p.id === personId)?.price_per_hour || 0

  // Per-project breakdown by category
  const projectBreakdown = (p: Project) => {
    const pPOs   = extPos.filter(po => po.project_id === p.id)
    const pAlloc = allocations.filter(a => a.project_id === p.id)
    const pOth  = others.filter(r => r.project_id === p.id)

    const personForPO = (po: ExternalPO) => extPeople.find(per => per.id === po.person_id)
    const extForecast = pPOs.reduce((s, po) => {
      const person = personForPO(po)
      return person ? s + sumArr(calcPOForecast(person, po)) : s
    }, 0)
    const extPrevision = pPOs.reduce((s, po) => {
      const person = personForPO(po)
      return person ? s + calcPOPrevision(person, po) : s
    }, 0)
    const extActual = pPOs.reduce((s, po) => s + sumArr(po.monthly_actual || []), 0)

    const intForecast  = pAlloc.reduce((s, a) => s + sumArr(calcAllocationExpected(a, pph(a.person_id))), 0)
    const intPrevision = pAlloc.reduce((s, a) => s + previsionInt(calcAllocationExpected(a, pph(a.person_id)), a.monthly_actual || []), 0)
    const intActual    = pAlloc.reduce((s, a) => s + sumArr(a.monthly_actual || []), 0)

    const othForecast  = pOth.reduce((s, r) => s + sumArr(r.monthly_expected || []), 0)
    const othPrevision = pOth.reduce((s, r) => s + prevision(r.monthly_expected || [], r.monthly_actual || []), 0)
    const othActual    = pOth.reduce((s, r) => s + sumArr(r.monthly_actual || []), 0)

    const totalBudget    = (p.external_budget || 0) + (p.internal_budget || 0) + (p.additional_budget || 0)
    const totalForecast  = extForecast + intForecast + othForecast
    const totalPrevision = extPrevision + intPrevision + othPrevision
    const totalActual    = extActual + intActual + othActual
    const gap      = totalBudget - totalForecast
    const consumed = totalBudget > 0 ? (totalForecast / totalBudget) * 100 : 0

    return {
      rows: [
        { label: 'External', budget: p.external_budget || 0, forecast: extForecast, prevision: extPrevision, actual: extActual },
        { label: 'Internal', budget: p.internal_budget || 0, forecast: intForecast, prevision: intPrevision, actual: intActual },
        { label: 'Others',   budget: p.additional_budget || 0, forecast: othForecast, prevision: othPrevision, actual: othActual },
      ],
      totalBudget, totalForecast, totalPrevision, totalActual, gap, consumed,
    }
  }

  const yearProjects     = projects.filter(p => p.year === year)
  const teamFiltered     = teamFilter === null ? yearProjects : yearProjects.filter(p => p.team_id === teamFilter)
  const filteredProjects = projectFilter === null ? teamFiltered : teamFiltered.filter(p => p.id === projectFilter)
  const yearTeams        = teams.filter(t => t.year === year)
  const filteredTeams    = teamFilter === null ? yearTeams : yearTeams.filter(t => t.id === teamFilter)

  const teamStats = (t: Team) => {
    const tProjects    = filteredProjects.filter(p => p.team_id === t.id)
    const tProjectIds  = new Set(tProjects.map(p => p.id))
    const covered = tProjects.reduce((s, p) => s + (p.external_budget || 0) + (p.internal_budget || 0) + (p.additional_budget || 0), 0)

    // Only count resources explicitly assigned to this team (team_id match), within the team's projects
    const intNeeded = allocations
      .filter(a => tProjectIds.has(a.project_id as number) && a.team_id === t.id)
      .reduce((s, a) => s + sumArr(calcAllocationExpected(a, pph(a.person_id))), 0)
    const extNeeded = extPos
      .filter(po => tProjectIds.has(po.project_id as number) && po.team_id === t.id)
      .reduce((s, po) => {
        const person = extPeople.find(p => p.id === po.person_id)
        return person ? s + sumArr(calcPOForecast(person, po)) : s
      }, 0)
    const othNeeded = others
      .filter(r => tProjectIds.has(r.project_id) && r.team_id === t.id)
      .reduce((s, r) => s + sumArr(r.monthly_expected || []), 0)

    const needed = intNeeded + extNeeded + othNeeded
    return { covered, needed, gap: covered - needed, projectCount: tProjects.length, tProjects, intNeeded, extNeeded, othNeeded }
  }

  // Global summary
  const allBd = filteredProjects.reduce((s, p) => s + (p.external_budget || 0) + (p.internal_budget || 0) + (p.additional_budget || 0), 0)
  const allFc = filteredProjects.reduce((s, p) => s + projectBreakdown(p).totalForecast, 0)
  const allPrevision = filteredProjects.reduce((s, p) => s + projectBreakdown(p).totalPrevision, 0)
  const expectedGap = allBd - allPrevision
  const consumedColor = (pct: number) => pct > 105 ? '#ff4d4f' : pct > 100 ? '#faad14' : '#52c41a'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Overview</Title>
        <Tag color="blue" style={{ fontSize: 13, padding: '2px 10px' }}>{year}</Tag>
        <Select
          allowClear
          placeholder="All teams"
          style={{ width: 200 }}
          value={teamFilter}
          onChange={v => { setTeamFilter(v ?? null); setProjectFilter(null) }}
          options={yearTeams.map(t => ({ value: t.id, label: t.name }))}
        />
        <Select
          allowClear
          showSearch
          placeholder="All projects"
          style={{ width: 220 }}
          value={projectFilter}
          onChange={v => setProjectFilter(v ?? null)}
          filterOption={(input, opt) => String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
          options={(teamFilter === null ? yearProjects : yearProjects.filter(p => p.team_id === teamFilter))
            .map(p => ({ value: p.id, label: `${p.project_number} – ${p.name}` }))}
        />
      </div>

      {/* Summary strip */}
      <Row gutter={16} style={{ marginBottom: 28 }}>
        {[
          { label: 'Total Budget', value: allBd },
          { label: 'Total Forecast', value: allFc },
          { label: 'Total Prevision', value: allPrevision },
        ].map(({ label, value }) => (
          <Col flex="1" key={label}>
            <Card size="small" variant="borderless" style={{ background: '#fafafa' }}>
              <Statistic title={label} value={value} formatter={v => fmt(v as number)} />
            </Card>
          </Col>
        ))}
        <Col flex="1">
          <Card size="small" variant="borderless" style={{ background: '#fafafa' }}>
            <Statistic title="Prevision Gap" value={expectedGap} formatter={v => fmt(v as number)}
              valueStyle={{ color: expectedGap < 0 ? '#ff4d4f' : '#52c41a' }} />
          </Card>
        </Col>
      </Row>

      {/* Projects */}
      <Title level={5} style={{ marginBottom: 12 }}>Projects</Title>
      <Row gutter={[16, 16]} style={{ marginBottom: 32 }}>
        {filteredProjects.map(p => {
          const bd = projectBreakdown(p)
          const tn = teamName(p.team_id)
          return (
            <Col xs={24} lg={12} xl={8} key={p.id}>
              <Card
                size="small"
                style={{ height: '100%' }}
                title={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Text strong style={{ fontSize: 13 }}>{p.project_number}</Text>
                    <Text style={{ fontSize: 13, color: '#555' }}>{p.name}</Text>
                    {tn && <Tag color="blue" style={{ marginLeft: 'auto' }}>{tn}</Tag>}
                  </div>
                }
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  {/* Breakdown table */}
                  <table style={{ flex: 1, minWidth: 0, width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ color: '#888' }}>
                        <th style={{ textAlign: 'left', fontWeight: 500, paddingBottom: 3, width: '22%' }}></th>
                        <th style={{ textAlign: 'right', fontWeight: 500, paddingBottom: 3 }}>Budget</th>
                        <th style={{ textAlign: 'right', fontWeight: 500, paddingBottom: 3 }}>Forecast</th>
                        <th style={{ textAlign: 'right', fontWeight: 500, paddingBottom: 3, color: '#1677ff' }}>Prevision</th>
                        <th style={{ textAlign: 'right', fontWeight: 500, paddingBottom: 3 }}>Actual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bd.rows.map(row => (
                        <tr key={row.label} style={{ borderTop: '1px solid #f5f5f5' }}>
                          <td style={{ padding: '2px 0', color: '#666' }}>{row.label}</td>
                          <td style={{ textAlign: 'right', padding: '2px 0' }}>{fmt(row.budget)}</td>
                          <td style={{ textAlign: 'right', padding: '2px 0' }}>{fmt(row.forecast)}</td>
                          <td style={{ textAlign: 'right', padding: '2px 0', color: '#1677ff' }}>{fmt(row.prevision)}</td>
                          <td style={{ textAlign: 'right', padding: '2px 0' }}>{fmt(row.actual)}</td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: '2px solid #e8e8e8', fontWeight: 600 }}>
                        <td style={{ padding: '3px 0' }}>Total</td>
                        <td style={{ textAlign: 'right', padding: '3px 0' }}>{fmt(bd.totalBudget)}</td>
                        <td style={{ textAlign: 'right', padding: '3px 0' }}>{fmt(bd.totalForecast)}</td>
                        <td style={{ textAlign: 'right', padding: '3px 0', color: '#1677ff' }}>{fmt(bd.totalPrevision)}</td>
                        <td style={{ textAlign: 'right', padding: '3px 0' }}>{fmt(bd.totalActual)}</td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Segmented bar: fill = Prevision, arrow marker = Actual */}
                  {(() => {
                    const prevPct   = bd.totalBudget > 0 ? (bd.totalPrevision / bd.totalBudget) * 100 : 0
                    const actualPct = bd.totalBudget > 0 ? (bd.totalActual    / bd.totalBudget) * 100 : 0
                    const prevColor   = consumedColor(prevPct)
                    const actualColor = consumedColor(actualPct)
                    const gap = bd.totalBudget - bd.totalPrevision
                    const segments  = 10
                    const filled    = Math.min(segments, Math.round(Math.min(prevPct, 100) / 100 * segments))
                    const barHeight = 110
                    const markerPos = Math.min(Math.max(actualPct, 0), 100)
                    return (
                      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', width: 100, marginRight: 24 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: prevColor, padding: '2px 10px', borderRadius: 4, marginBottom: 6 }}>
                          {prevPct.toFixed(0)}%
                        </div>
                        <div style={{ position: 'relative', width: 36, height: barHeight }}>
                          <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 2, height: '100%' }}>
                            {Array.from({ length: segments }).map((_, i) => (
                              <div key={i} style={{ flex: 1, borderRadius: 1, background: i < filled ? prevColor : '#e8e8e8' }} />
                            ))}
                          </div>
                          {/* Actual marker */}
                          <div style={{ position: 'absolute', left: '100%', bottom: `calc(${markerPos}% - 7px)`, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', marginLeft: 4 }}>
                            <span style={{ fontSize: 14, color: actualColor, lineHeight: 1 }}>◄</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: actualColor, marginLeft: 2 }}>{actualPct.toFixed(0)}%</span>
                          </div>
                        </div>
                        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: gap < 0 ? '#ff4d4f' : '#52c41a' }}>
                          {fmt(gap)}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </Card>
            </Col>
          )
        })}
        {projects.length === 0 && (
          <Col span={24}><Text type="secondary">No projects yet.</Text></Col>
        )}
      </Row>

      {/* Teams */}
      <Title level={5} style={{ marginBottom: 12 }}>Teams</Title>
      <Row gutter={[16, 16]}>
        {filteredTeams.map(t => {
          const s = teamStats(t)
          const gapColor = s.gap < 0 ? '#ff4d4f' : '#52c41a'
          const intAllocs = allocations.filter(a => a.team_id === t.id)
          const intMemberIds = [...new Set(intAllocs.map(a => a.person_id))]
          const extPOsForTeam = extPos.filter(po => po.team_id === t.id)
          const extPersonIds = [...new Set(extPOsForTeam.map(po => po.person_id))]
          const totalMembers = intMemberIds.length + extPersonIds.length
          return (
            <Col xs={24} md={12} xl={8} key={t.id}>
              <Card
                size="small"
                style={{ height: '100%' }}
                title={
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text strong>{t.name}</Text>
                    <Tag>{totalMembers} member{totalMembers !== 1 ? 's' : ''}</Tag>
                  </div>
                }
              >
                {/* Members */}
                {totalMembers > 0 && (
                  <div style={{ marginBottom: 8, fontSize: 12 }}>
                    {intAllocs.map(a => {
                      const name = people.find(p => p.id === a.person_id)?.name || '?'
                      const proj = projects.find(p => p.id === a.project_id)
                      return (
                        <Tag key={`int-${a.id}`} color="blue" style={{ marginBottom: 4 }}>
                          {name} <span style={{ opacity: 0.75 }}>({a.dedication_pct ?? 100}%{proj ? ` · ${proj.project_number}` : ''})</span>
                        </Tag>
                      )
                    })}
                    {extPersonIds.map(pid => {
                      const name = extPeople.find(p => p.id === pid)?.name || '?'
                      return <Tag key={`ext-${pid}`} color="orange" style={{ marginBottom: 4 }}>{name}</Tag>
                    })}
                  </div>
                )}

                {/* Projects */}
                <div style={{ marginBottom: 10, fontSize: 12 }}>
                  {s.tProjects.length > 0
                    ? s.tProjects.map(p => <Tag key={p.id} color="geekblue" style={{ marginBottom: 4 }}>{p.project_number} {p.name}</Tag>)
                    : <Text type="secondary" style={{ fontSize: 12 }}>No projects assigned</Text>
                  }
                </div>

                {/* Budget metrics */}
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <tbody>
                    <tr style={{ borderTop: '1px solid #f5f5f5' }}>
                      <td style={{ padding: '3px 0', color: '#888' }}>· External</td>
                      <td style={{ textAlign: 'right', color: '#888' }}>{fmt(s.extNeeded)}</td>
                    </tr>
                    <tr style={{ borderTop: '1px solid #f5f5f5' }}>
                      <td style={{ padding: '3px 0', color: '#888' }}>· Internal</td>
                      <td style={{ textAlign: 'right', color: '#888' }}>{fmt(s.intNeeded)}</td>
                    </tr>
                    <tr style={{ borderTop: '1px solid #f5f5f5' }}>
                      <td style={{ padding: '3px 0', color: '#888' }}>· Others</td>
                      <td style={{ textAlign: 'right', color: '#888' }}>{fmt(s.othNeeded)}</td>
                    </tr>
                    <tr style={{ borderTop: '2px solid #e8e8e8' }}>
                      <td style={{ padding: '4px 0', fontWeight: 600 }}>Budget Needed</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(s.needed)}</td>
                    </tr>
                    <tr style={{ borderTop: '1px solid #f5f5f5' }}>
                      <td style={{ padding: '3px 0', color: '#666' }}>Budget Covered</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(s.covered)}</td>
                    </tr>
                    <tr style={{ borderTop: '2px solid #e8e8e8' }}>
                      <td style={{ padding: '4px 0', fontWeight: 600 }}>Gap</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: gapColor }}>{fmt(s.gap)}</td>
                    </tr>
                  </tbody>
                </table>

                {s.covered > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <Progress
                      percent={Math.min(s.needed > 0 ? (s.covered / s.needed) * 100 : 0, 100)}
                      showInfo={false}
                      strokeColor={gapColor}
                      size="small"
                    />
                  </div>
                )}
              </Card>
            </Col>
          )
        })}
        {filteredTeams.length === 0 && (
          <Col span={24}><Text type="secondary">No teams for {year}.</Text></Col>
        )}
      </Row>
    </div>
  )
}
