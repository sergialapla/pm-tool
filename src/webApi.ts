// Browser shim for window.api — used when running as a web app (not Electron).
// The preload script sets window.api in Electron; this runs only if it isn't set yet.
if (!window.api) {
  window.api = {
    invoke: async (channel: string, ...args: unknown[]): Promise<unknown> => {
      const res = await fetch('/api/invoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, args }),
      })
      const data = await res.json() as { ok: boolean; result?: unknown; error?: string }
      if (!data.ok) throw new Error(data.error ?? 'Server error')
      return data.result
    },
  }
}
