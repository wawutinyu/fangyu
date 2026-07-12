const { contextBridge } = require('electron')

const BACKEND_PORT = 8000

contextBridge.exposeInMainWorld('__FANGYU_PLATFORM__', {
  kind: 'desktop',
  apiBase: `http://127.0.0.1:${BACKEND_PORT}`,
  platform: process.platform,
})
