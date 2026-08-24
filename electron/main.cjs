// Electron main process.
//
// Why .cjs: package.json has "type": "module" for the Vite/React app, but
// Electron's main process is simplest and most compatible as CommonJS —
// the .cjs extension forces that regardless of the package's ESM setting.

const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const os = require('node:os')

// node-pty is a native module — it must be compiled on whichever machine
// (and OS) actually runs the app. `npm install` handles this automatically
// via node-gyp as long as it can reach the network for headers; it's why
// this can't be pre-built once and shipped for every platform.
const pty = require('node-pty')

const isDev = !!process.env.VITE_DEV_SERVER_URL

/** @type {Map<number, import('node-pty').IPty>} one real shell per window */
const ptys = new Map()

function shellForPlatform() {
  if (process.platform === 'darwin') return process.env.SHELL || '/bin/zsh'
  if (process.platform === 'linux') return process.env.SHELL || '/bin/bash'
  // Not asked for, but avoids a hard crash if someone runs this on Windows.
  return process.env.COMSPEC || 'powershell.exe'
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    title: 'FareIDE',
    backgroundColor: '#0a0a0e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  const id = win.webContents.id

  ipcMain.on('pty:spawn', (event, { cols, rows }) => {
    if (event.sender.id !== id) return
    ptys.get(id)?.kill()
    const shell = shellForPlatform()
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: os.homedir(),
      env: process.env,
    })
    ptyProcess.onData((data) => {
      if (!event.sender.isDestroyed()) event.sender.send('pty:data', data)
    })
    ptyProcess.onExit(({ exitCode }) => {
      if (!event.sender.isDestroyed()) event.sender.send('pty:exit', exitCode)
    })
    ptys.set(id, ptyProcess)
  })

  ipcMain.on('pty:input', (event, data) => {
    if (event.sender.id !== id) return
    ptys.get(id)?.write(data)
  })

  ipcMain.on('pty:resize', (event, { cols, rows }) => {
    if (event.sender.id !== id) return
    try { ptys.get(id)?.resize(cols, rows) } catch { /* pty may have just exited */ }
  })

  win.on('closed', () => {
    ptys.get(id)?.kill()
    ptys.delete(id)
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
