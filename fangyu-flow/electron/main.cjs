const { app, BrowserWindow } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')

const isDev = process.env.NODE_ENV !== 'production'
const BACKEND_PORT = 8000
const DEV_FRONTEND_PORT = 5173

let backendProcess = null
let mainWindow = null

function startBackend() {
  const fangyuRoot = path.join(__dirname, '..', '..')
  const pythonCmd = process.platform === 'win32' ? 'py' : 'python3'

  backendProcess = spawn(pythonCmd, ['-m', 'fangyu', '--server'], {
    cwd: fangyuRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  backendProcess.stdout.on('data', (data) => {
    console.log(`[backend] ${data.toString().trim()}`)
  })

  backendProcess.stderr.on('data', (data) => {
    console.log(`[backend] ${data.toString().trim()}`)
  })

  backendProcess.on('exit', (code) => {
    console.log(`[backend] exited with code ${code}`)
  })
}

function waitForBackend(retries = 30) {
  return new Promise((resolve, reject) => {
    function check(attempt) {
      http.get(`http://127.0.0.1:${BACKEND_PORT}/api/health`, (res) => {
        if (res.statusCode === 200) {
          resolve()
        } else if (attempt < retries) {
          setTimeout(() => check(attempt + 1), 1000)
        } else {
          reject(new Error('Backend not ready'))
        }
      }).on('error', () => {
        if (attempt < retries) {
          setTimeout(() => check(attempt + 1), 1000)
        } else {
          reject(new Error('Backend not ready'))
        }
      })
    }
    check(0)
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'fangyu-flow — AI Flow Canvas',
  })

  if (isDev) {
    mainWindow.loadURL(`http://localhost:${DEV_FRONTEND_PORT}`)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  startBackend()
  try {
    await waitForBackend()
    console.log('[electron] Backend ready')
  } catch {
    console.error('[electron] Backend failed to start')
  }
  createWindow()
})

app.on('window-all-closed', () => {
  if (backendProcess) {
    backendProcess.kill()
    backendProcess = null
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill()
    backendProcess = null
  }
})
