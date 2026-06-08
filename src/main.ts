import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { initDb } from './db'
import './ipc'

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string
declare const MAIN_WINDOW_VITE_NAME: string

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    mainWindow.webContents.openDevTools()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`))
  }
}

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('com.pm-tool')
  initDb()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
