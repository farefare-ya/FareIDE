const { contextBridge, ipcRenderer } = require('electron')

// Deliberately narrow surface: the renderer never gets raw ipcRenderer or
// any Node API, just spawn/write/resize/onData/onExit for one PTY per window.
contextBridge.exposeInMainWorld('electronTerminal', {
  spawn: (cols, rows) => ipcRenderer.send('pty:spawn', { cols, rows }),
  write: (data) => ipcRenderer.send('pty:input', data),
  resize: (cols, rows) => ipcRenderer.send('pty:resize', { cols, rows }),
  onData: (cb) => {
    const listener = (_event, data) => cb(data)
    ipcRenderer.on('pty:data', listener)
    return () => ipcRenderer.removeListener('pty:data', listener)
  },
  onExit: (cb) => {
    const listener = (_event, code) => cb(code)
    ipcRenderer.on('pty:exit', listener)
    return () => ipcRenderer.removeListener('pty:exit', listener)
  },
})

contextBridge.exposeInMainWorld('isElectron', true)
