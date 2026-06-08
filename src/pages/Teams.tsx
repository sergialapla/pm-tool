import { useEffect, useState } from 'react'
import {
  Table, Button, Modal, Form, Space,
  Popconfirm, Typography, Tag, Select, Input
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { api } from '../utils/api'
import type { Team, Project, InternalPerson, ExternalResource, AppSettings } from '../types'

const { Title } = Typography

export default function Teams(): JSX.Element {
  const [teams, setTeams] = useState<Team[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [people, setPeople]     = useState<InternalPerson[]>([])
  const [externals, setExternals] = useState<ExternalResource[]>([])
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Team | null>(null)
  const [members, setMembers] = useState<string[]>([])
  const [form] = Form.useForm()

  const load = async () => {
    const [t, p, ppl, e, s] = await Promise.all([api.teams.list(), api.projects.list(), api.people.list(), api.external.list(), api.settings.get()])
    setTeams(t)
    setProjects(p)
    setPeople(ppl)
    setExternals(e)
    setYear(Number((s as AppSettings).active_year) || new Date().getFullYear())
  }

  useEffect(() => { load() }, [])

  const memberOptions = [...people].filter(p => p.year === year).sort((a, b) => a.name.localeCompare(b.name)).map(p => ({ value: p.name, label: p.name }))

  const yearOpts = Array.from({ length: 10 }, (_, i) => {
    const y = new Date().getFullYear() - 2 + i
    return { value: y, label: String(y) }
  })

  const openAdd = () => {
    setEditing(null)
    setMembers([])
    form.resetFields()
    form.setFieldsValue({ year })
    setOpen(true)
  }

  const openEdit = (t: Team) => {
    setEditing(t)
    setMembers([...t.members])
    form.setFieldsValue({ name: t.name, year: t.year })
    setOpen(true)
  }

  const onOk = async () => {
    const { name, year: formYear } = await form.validateFields()
    if (editing) {
      await api.teams.update({ ...editing, name, year: formYear, members })
    } else {
      await api.teams.create({ name, year: formYear, members })
    }
    setOpen(false)
    load()
  }

  const onDelete = async (id: number) => {
    await api.teams.delete(id)
    load()
  }

  const filteredTeams = teams.filter(t => t.year === year)
  const teamProjects = (id: number) => projects.filter(p => p.team_id === id && p.year === year)

  const cols = [
    {
      title: 'Team Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a: Team, b: Team) => a.name.localeCompare(b.name)
    },
    {
      title: 'Year',
      dataIndex: 'year',
      key: 'year',
      width: 70,
      render: (y: number) => <Tag color="blue">{y}</Tag>
    },
    {
      title: 'Members',
      key: 'members',
      render: (_: unknown, t: Team) => {
        const extMembers = externals.filter(r => r.team_id === t.id)
        const hasAny = t.members.length > 0 || extMembers.length > 0
        return (
          <Space wrap size={4}>
            {hasAny ? (
              <>
                {t.members.map(m => <Tag key={`int-${m}`} color="blue">{m}</Tag>)}
                {extMembers.map(r => <Tag key={`ext-${r.id}`} color="orange">{r.name}</Tag>)}
              </>
            ) : (
              <span style={{ color: '#aaa' }}>—</span>
            )}
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
          ? <Space wrap size={4}>{ps.map(p => <Tag key={p.id} color="blue">{p.project_number} {p.name} · {p.year}</Tag>)}</Space>
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
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Title level={4} style={{ margin: 0 }}>Teams</Title>
          <Tag color="blue" style={{ fontSize: 13, padding: '2px 10px' }}>{year}</Tag>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Add Team</Button>
      </div>

      <Table dataSource={filteredTeams} columns={cols} rowKey="id" size="small" pagination={false} />

      <Modal
        open={open}
        title={editing ? 'Edit Team' : 'Add Team'}
        onOk={onOk}
        onCancel={() => setOpen(false)}
        destroyOnClose
        width={500}
      >
        <Form form={form} layout="vertical">
          <Space style={{ width: '100%' }} styles={{ item: { flex: 1 } }}>
            <Form.Item name="name" label="Team Name" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item name="year" label="Year" rules={[{ required: true }]} style={{ width: 110 }}>
              <Select options={yearOpts} />
            </Form.Item>
          </Space>
          <Form.Item label="Members" help={memberOptions.length === 0 ? 'Add people in Resources → Internal first' : undefined}>
            <Select
              mode="multiple"
              value={members}
              onChange={setMembers}
              options={memberOptions}
              placeholder="Select members from internal resources"
              style={{ width: '100%' }}
              allowClear
              showSearch
              filterOption={(input, option) =>
                (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
