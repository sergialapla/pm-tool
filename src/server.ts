import express from 'express'
import { join } from 'path'
import { dispatch } from './handlers'
import { initDb } from './db'

const PORT = Number(process.env.PORT) || 3000
const WEB_DIR = join(__dirname, '..', 'out', 'web')

const app = express()
app.use(express.json())
app.use(express.static(WEB_DIR))

app.post('/api/invoke', async (req, res) => {
  const { channel, args = [] } = req.body as { channel: string; args: unknown[] }
  try {
    const result = await dispatch(channel, args)
    res.json({ ok: true, result })
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) })
  }
})

// SPA fallback — all non-API routes serve index.html (HashRouter handles the rest)
app.get('*', (_req, res) => {
  res.sendFile(join(WEB_DIR, 'index.html'))
})

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`PM Tool running → http://localhost:${PORT}`)
    console.log('Press Ctrl+C to stop.')
  })
}).catch(err => {
  console.error('Failed to initialise database:', err)
  process.exit(1)
})
