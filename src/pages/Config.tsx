import { useEffect, useState } from 'react'
import {
  Tabs, Table, Button, Modal, Form, Input,
  Space, Popconfirm, Typography, Select, Tag, message
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, FolderOpenOutlined } from '@ant-design/icons'
import { api } from '../utils/api'
import type { Company, Team, Project, InternalPerson, InternalAllocation, ExternalResource } from '../types'

const { Title } = Typography

export default function Config(): JSX.Element {
  const [activeYear, setActiveYear] = useState<number>(new Date().getFullYear())

  useEffect(() => {
    api.settings.get().then(s => {
      setActiveYear(Number(s.active_year) || new Date().getFullYear())
    })
  }, [])

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Configuration</Title>
      <Tabs items={[
        { key: 'teams', label: 'Teams', children: <TeamsTab activeYear={activeYear} /> },
        { key: 'companies', label: 'Companies', children: <CompaniesTab /> },
        { key: 'settings', label: 'Settings', children: <SettingsTab onYearChange={setActiveYear} /> },
      ]} />
    </div>
  )
}

// ── Teams ─────────────────────────────────────────────────────────────────────

const TEAM_YEAR_OPTS = Array.from({ length: 10 }, (_, i) => {
  const y = new Date().getFullYear() - 2 + i
  return { value: y, label: String(y) }
})

function TeamsTab({ activeYear }: { activeYear: number }): JSX.Element {
  const [teams, setTeams] = useState<Team[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [people, setPeople]           = useState<InternalPerson[]>([])
  const [allocations, setAllocations] = useState<InternalAllocation[]>([])
  const [externals, setExternals] = useState<ExternalResource[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Team | null>(null)
  const [form] = Form.useForm()

  const load = async () => {
    const [t, p, ppl, alc, e] = await Promise.all([
      api.teams.list(), api.projects.list(), api.people.list(), api.allocations.list(), api.external.list()
    ])
    setTeams(t); setProjects(p); setPeople(ppl); setAllocations(alc); setExternals(e)
  }

  useEffect(() => { load() }, [])

  const openAdd = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ year: activeYear })
    setOpen(true)
  }
  const openEdit = (t: Team) => {
    setEditing(t)
    form.setFieldsValue({ name: t.name, year: t.year })
    setOpen(true)
  }

  const onOk = async () => {
    const { name, year } = await form.validateFields()
    if (editing) {
      await api.teams.update({ ...editing, name, year })
    } else {
      await api.teams.create({ name, year, members: [] })
    }
    setOpen(false)
    load()
  }

  const onDelete = async (id: number) => { await api.teams.delete(id); load() }

  const filteredTeams = teams.filter(t => t.year === activeYear)
  const teamIntMembers = (id: number) =>
    [...new Set(allocations.filter(a => a.team_id === id).map(a => people.find(p => p.id === a.person_id)?.name).filter(Boolean))] as string[]
  const teamExtMembers = (id: number) => externals.filter(r => r.team_id === id)
  const teamProjects = (id: number) => projects.filter(p => p.team_id === id && p.year === activeYear)

  const cols = [
    { title: 'Team Name', dataIndex: 'name', key: 'name', width: 160,
      sorter: (a: Team, b: Team) => a.name.localeCompare(b.name) },
    { title: 'Year', dataIndex: 'year', key: 'year', width: 70,
      render: (y: number) => <Tag color="blue">{y}</Tag> },
    {
      title: 'Members',
      key: 'members',
      render: (_: unknown, t: Team) => {
        const ints = teamIntMembers(t.id)
        const exts = teamExtMembers(t.id)
        const hasAny = ints.length > 0 || exts.length > 0
        return (
          <Space wrap size={4}>
            {hasAny ? (
              <>
                {ints.map(m => <Tag key={`int-${m}`} color="blue">{m}</Tag>)}
                {exts.map(r => <Tag key={`ext-${r.id}`} color="orange">{r.name}</Tag>)}
              </>
            ) : <span style={{ color: '#aaa' }}>—</span>}
          </Space>
        )
      }
    },
    {
      title: 'Projects',
      key: 'projects',
      render: (_: unknown, t: Team) => {
        const ps = teamProjects(t.id)
        return ps.length > 0
          ? <Space wrap size={4}>{ps.map(p => <Tag key={p.id} color="geekblue">{p.project_number} {p.name}</Tag>)}</Space>
          : <span style={{ color: '#aaa' }}>—</span>
      }
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_: unknown, t: Team) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(t)} />
          <Popconfirm title="Delete team?" onConfirm={() => onDelete(t.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Add Team</Button>
        <Tag color="blue" style={{ fontSize: 13, padding: '2px 10px' }}>{activeYear}</Tag>
      </div>
      <Table dataSource={filteredTeams} columns={cols} rowKey="id" size="small" pagination={false} />
      <Modal
        open={open}
        title={editing ? 'Edit Team' : 'Add Team'}
        onOk={onOk}
        onCancel={() => setOpen(false)}
        destroyOnClose
        width={440}
      >
        <Form form={form} layout="vertical">
          <Space style={{ width: '100%' }} styles={{ item: { flex: 1 } }}>
            <Form.Item name="name" label="Team Name" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Input autoFocus />
            </Form.Item>
            <Form.Item name="year" label="Year" rules={[{ required: true }]} style={{ width: 110 }}>
              <Select options={TEAM_YEAR_OPTS} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </>
  )
}

// ── Companies ─────────────────────────────────────────────────────────────────

function CompaniesTab(): JSX.Element {
  const [data, setData] = useState<Company[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Company | null>(null)
  const [form] = Form.useForm()

  const load = () => api.companies.list().then(setData)
  useEffect(() => { load() }, [])

  const openAdd = () => { setEditing(null); form.resetFields(); setOpen(true) }
  const openEdit = (r: Company) => { setEditing(r); form.setFieldsValue(r); setOpen(true) }

  const onOk = async () => {
    const vals = await form.validateFields()
    if (editing) {
      await api.companies.update({ ...editing, ...vals })
    } else {
      await api.companies.create(vals)
    }
    setOpen(false)
    load()
  }

  const onDelete = async (id: number) => {
    await api.companies.delete(id)
    load()
  }

  const cols = [
    { title: 'Name', dataIndex: 'name', key: 'name', sorter: (a: Company, b: Company) => a.name.localeCompare(b.name) },
    { title: 'Country', dataIndex: 'country', key: 'country' },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_: unknown, r: Company) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="Delete company?" onConfirm={() => onDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Add Company</Button>
      </div>
      <Table dataSource={data} columns={cols} rowKey="id" size="small" pagination={false} />
      <Modal
        open={open}
        title={editing ? 'Edit Company' : 'Add Company'}
        onOk={onOk}
        onCancel={() => setOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="country" label="Country">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

// ── Settings ──────────────────────────────────────────────────────────────────

const YEAR_OPTIONS = Array.from({ length: 10 }, (_, i) => {
  const y = new Date().getFullYear() - 2 + i
  return { value: String(y), label: String(y) }
})

function SettingsTab({ onYearChange }: { onYearChange: (y: number) => void }): JSX.Element {
  const [year, setYear] = useState<string>('')
  const [dbPath, setDbPath] = useState<string>('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.settings.get().then(s => {
      setYear(s.active_year || String(new Date().getFullYear()))
      setDbPath(s.db_path || '')
    })
  }, [])

  const saveYear = async (v: string) => {
    setYear(v)
    await api.settings.set('active_year', v)
    onYearChange(Number(v))
    message.success('Active year updated')
  }

  const browseDb = async () => {
    const path = await api.dialog.openFile()
    if (path) setDbPath(path)
  }

  const saveDbPath = async () => {
    setLoading(true)
    try {
      await api.settings.set('db_path', dbPath)
      await api.settings.setDbPath(dbPath)
      message.success('Database path updated — reconnected')
    } catch {
      message.error('Failed to open database at that path')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 480, paddingTop: 8 }}>
      <Form layout="vertical">
        <Form.Item label="Active Year">
          <Select value={year} options={YEAR_OPTIONS} onChange={saveYear} style={{ width: 160 }} />
        </Form.Item>
        <Form.Item
          label="Shared Database Path"
          help="Point all users to the same .db file on a network drive"
        >
          <Space.Compact style={{ width: '100%' }}>
            <Input value={dbPath} onChange={e => setDbPath(e.target.value)} placeholder="C:\Shared\pm-tool.db" />
            <Button icon={<FolderOpenOutlined />} onClick={browseDb} />
          </Space.Compact>
        </Form.Item>
        <Button type="primary" onClick={saveDbPath} loading={loading}>
          Apply Database Path
        </Button>
      </Form>
    </div>
  )
}
