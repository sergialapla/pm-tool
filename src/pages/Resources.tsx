import { Tabs } from 'antd'

export default function Resources(): JSX.Element {
  return (
    <Tabs items={[
      { key: 'external', label: 'External', children: <div>External Resources — coming soon</div> },
      { key: 'internal', label: 'Internal', children: <div>Internal Resources — coming soon</div> },
      { key: 'others', label: 'Others', children: <div>Others — coming soon</div> }
    ]} />
  )
}
