import { Layout, Menu } from 'antd'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  DashboardOutlined,
  ProjectOutlined,
  TeamOutlined,
  ReconciliationOutlined,
  SettingOutlined
} from '@ant-design/icons'

const { Sider, Content } = Layout

const menuItems = [
  { key: '/overview', icon: <DashboardOutlined />, label: 'Overview' },
  { key: '/projects', icon: <ProjectOutlined />, label: 'Projects' },
  { key: '/teams', icon: <TeamOutlined />, label: 'Teams' },
  { key: '/resources', icon: <ReconciliationOutlined />, label: 'Resources' },
  { key: '/config', icon: <SettingOutlined />, label: 'Config' }
]

export default function AppLayout({ children }: { children: React.ReactNode }): JSX.Element {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider collapsible width={200}>
        <div style={{ color: '#fff', fontWeight: 700, fontSize: 16, padding: '16px 24px', borderBottom: '1px solid #303030' }}>
          PM Tool
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Content style={{ padding: 24, overflow: 'auto' }}>{children}</Content>
      </Layout>
    </Layout>
  )
}
