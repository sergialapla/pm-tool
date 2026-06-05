import { Tabs } from 'antd'

export default function Config(): JSX.Element {
  return (
    <Tabs items={[
      { key: 'companies', label: 'Companies', children: <div>Companies — coming soon</div> },
      { key: 'settings', label: 'Settings', children: <div>Settings (DB path, Year) — coming soon</div> }
    ]} />
  )
}
