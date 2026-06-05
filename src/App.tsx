import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import Overview from './pages/Overview'
import Projects from './pages/Projects'
import Teams from './pages/Teams'
import Resources from './pages/Resources'
import Config from './pages/Config'

export default function App(): JSX.Element {
  return (
    <HashRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<Overview />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/resources" element={<Resources />} />
          <Route path="/config" element={<Config />} />
        </Routes>
      </AppLayout>
    </HashRouter>
  )
}
