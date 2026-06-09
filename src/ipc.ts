import { ipcMain, dialog } from 'electron'
import { dispatch } from './handlers'

const CHANNELS = [
  'companies:list', 'companies:create', 'companies:update', 'companies:delete',
  'teams:list', 'teams:create', 'teams:update', 'teams:delete',
  'projects:list', 'projects:create', 'projects:update', 'projects:delete',
  'external:list', 'external:upsert', 'external:delete',
  'ext-people:list', 'ext-people:upsert', 'ext-people:delete',
  'ext-pos:list', 'ext-pos:upsert', 'ext-pos:delete',
  'people:list', 'people:upsert', 'people:delete',
  'allocations:list', 'allocations:upsert', 'allocations:delete',
  'others:list', 'others:upsert', 'others:delete',
  'settings:get', 'settings:set', 'settings:setDbPath',
]

for (const ch of CHANNELS) {
  ipcMain.handle(ch, (_event, ...args) => dispatch(ch, args))
}

// dialog is Electron-only; web mode returns null from handlers.ts
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite'] }],
  })
  return result.canceled ? null : result.filePaths[0]
})
