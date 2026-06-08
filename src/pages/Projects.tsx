import { useEffect, useState } from 'react'
import {
  Table, Button, Modal, Form, Input, InputNumber,
  Space, Popconfirm, Typography, Select, Tag
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { api } from '../utils/api'
import { fmt, sumArr, calcExternalExpected, calcAllocationExpected } from '../utils/format'
import type { Project, Team, ExternalResource, InternalPerson, InternalAllocation, OtherResource } from '../types'

const { Title } = Typography

const ZERO_ARR = () => Array(12).fill(0)

export default function Projects(): JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [externals, setExternals]     = useState<ExternalResource[]>([])
  const [people, setPeople]           = useState<InternalPerson[]>([])
  const [allocations, setAllocations] = useState<InternalAllocation[]>([])
  const [others, setOthers]           = useState<OtherResource[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [form] = Form.useForm()
  const [year, setYear] = useState<number>(new Date().getFullYear())

  const load = async () => {
    const [p, t, e, ppl, alc, o, s] = await Promise.all([
      api.projects.list(),
      api.teams.list(),
      api.external.list(),
      api.people.list(),
      api.allocations.list(),
      api.others.list(),
      api.settings.get(),
    ])
    setProjects(p); setTeams(t); setExternals(e)
    setPeople(ppl); setAllocations(alc)
    setOthers(o)
    setYear(Number(s.active_year) || new Date().getFullYear())
  }

  useEffect(() => { load() }, [])

  const teamName = (id: number | null) => teams.find(t => t.id === id)?.name || '—'

  const getStats = (p: Project) => {
    const pph = (personId: number) => people.find(pp => pp.id === personId)?.price_per_hour || 0
    const forecast =
      externals.filter(r => r.project_id === p.id).reduce((s, r) => s + sumArr(calcExternalExpected(r)), 0) +
      allocations.filter(a => a.project_id === p.id).reduce((s, a) => s + sumArr(calcAllocationExpected(a, pph(a.person_id))), 0) +
      others.filter(r => r.project_id === p.id).reduce((s, r) => s + sumArr(r.monthly_expected || []), 0)
    return { forecast }
  }

  const openAdd = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ year })
    setOpen(true)
  }

  const openEdit = (p: Project) => {
    setEditing(p)
    form.setFieldsValue(p)
    setOpen(true)
  }

  const onOk = async () => {
    let vals: Record<string, unknown>
    try {
      vals = await form.validateFields()
    } catch {
      return
    }
    if (editing) {
      await api.projects.update({ ...editing, ...vals })
    } else {
      await api.projects.create(vals)
    }
    setOpen(false)
    load()
  }

  const onDelete = async (id: number) => {
    await api.projects.delete(id)
    load()
  }

  const cols = [
    { title: 'Project #', dataIndex: 'project_number', key: 'pn', width: 110 },
    { title: 'Name', dataIndex: 'name', key: 'name', sorter: (a: Project, b: Project) => a.name.localeCompare(b.name) },
    { title: 'Team', key: 'team', render: (_: unknown, p: Project) => teamName(p.team_id) },
    { title: 'Year', dataIndex: 'year', key: 'year', width: 70 },
    {
      title: 'Ext Budget',
      key: 'ext',
      align: 'right' as const,
      render: (_: unknown, p: Project) => fmt(p.external_budget)
    },
    {
      title: 'Int Budget',
      key: 'int',
      align: 'right' as const,
      render: (_: unknown, p: Project) => fmt(p.internal_budget)
    },
    {
      title: 'Add Budget',
      key: 'add',
      align: 'right' as const,
      render: (_: unknown, p: Project) => fmt(p.additional_budget)
    },
    {
      title: 'Total Budget',
      key: 'total',
      align: 'right' as const,
      render: (_: unknown, p: Project) => {
        const b = (p.external_budget || 0) + (p.internal_budget || 0) + (p.additional_budget || 0)
        return <strong>{fmt(b)}</strong>
      }
    },
    {
      title: 'Forecast',
      key: 'forecast',
      align: 'right' as const,
      render: (_: unknown, p: Project) => fmt(getStats(p).forecast)
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_: unknown, p: Project) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(p)} />
          <Popconfirm title="Delete project and all its resources?" onConfirm={() => onDelete(p.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ]

  const yearOpts = Array.from({ length: 10 }, (_, i) => {
    const y = new Date().getFullYear() - 2 + i
    return { value: y, label: String(y) }
  })

  const teamOpts = [{ value: null, label: 'No team' }, ...teams.map(t => ({ value: t.id, label: t.name }))]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Title level={4} style={{ margin: 0 }}>Projects</Title>
          <Tag color="blue" style={{ fontSize: 13, padding: '2px 10px' }}>{year}</Tag>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Add Project</Button>
      </div>

      <Table
        dataSource={projects.filter(p => p.year === year)}
        columns={cols}
        rowKey="id"
        size="small"
        scroll={{ x: 'max-content' }}
        pagination={false}
      />

      <Modal
        open={open}
        title={editing ? 'Edit Project' : 'Add Project'}
        onOk={onOk}
        onCancel={() => setOpen(false)}
        destroyOnClose
        width={540}
      >
        <Form form={form} layout="vertical">
          <Space style={{ width: '100%' }} styles={{ item: { flex: 1 } }}>
            <Form.Item name="project_number" label="Project Number" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item name="year" label="Year" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={yearOpts} />
            </Form.Item>
          </Space>
          <Form.Item name="name" label="Project Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="team_id" label="Assigned Team">
            <Select options={teamOpts} allowClear />
          </Form.Item>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            Budget — Total = External + Internal + Additional
          </Typography.Text>
          <Space style={{ width: '100%' }}>
            <Form.Item name="external_budget" label="External Budget" initialValue={0}>
              <InputNumber style={{ width: 140 }} min={0} formatter={v => fmt(v as number)} />
            </Form.Item>
            <Form.Item name="internal_budget" label="Internal Budget" initialValue={0}>
              <InputNumber style={{ width: 140 }} min={0} formatter={v => fmt(v as number)} />
            </Form.Item>
            <Form.Item name="additional_budget" label="Additional Budget" initialValue={0}>
              <InputNumber style={{ width: 140 }} min={0} formatter={v => fmt(v as number)} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  )
}
