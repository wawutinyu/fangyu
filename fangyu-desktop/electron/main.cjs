const { app, BrowserWindow } = require('electron')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const http = require('http')

const BACKEND_PORT = 8000
const DEV_FRONTEND_PORT = Number(process.env.FANGYU_DEV_FRONTEND_PORT) || 5173

const DESKTOP_ROOT = path.join(__dirname, '..')
const REPO_ROOT = path.join(DESKTOP_ROOT, '..')
const FLOW_DIST = path.join(DESKTOP_ROOT, 'dist', 'index.html')

let backendProcess = null
let mainWindow = null

const isDev = !app.isPackaged

function getFangyuRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'fangyu')
  }
  return REPO_ROOT
}

function getPythonCmd() {
  return process.platform === 'win32' ? 'py' : 'python3'
}

function getUserDataDir() {
  const dataDir = path.join(app.getPath('userData'), 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  return dataDir
}

function startBackend() {
  const fangyuRoot = getFangyuRoot()
  const pythonCmd = getPythonCmd()
  const dataDir = getUserDataDir()

  backendProcess = spawn(
    pythonCmd,
    ['-m', 'fangyu', '--server'],
    {
      cwd: fangyuRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FANGYU_DATA_DIR: dataDir,
        HOST: '127.0.0.1',
        PORT: String(BACKEND_PORT),
        RELOAD: 'false',
      },
    },
  )

  backendProcess.stdout.on('data', (data) => {
    console.log(`[backend] ${data.toString().trim()}`)
  })

  backendProcess.stderr.on('data', (data) => {
    console.log(`[backend] ${data.toString().trim()}`)
  })

  backendProcess.on('exit', (code) => {
    console.log(`[backend] exited with code ${code}`)
    backendProcess = null
  })
}

function stopBackend() {
  if (!backendProcess) return
  backendProcess.kill()
  backendProcess = null
}

function waitForBackend(retries = 45) {
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
      preload: path.join(__dirname, 'preload.cjs'),
    },
    title: 'fangyu — AI Flow Canvas',
  })

  if (isDev) {
    mainWindow.loadURL(`http://localhost:${DEV_FRONTEND_PORT}`)
    if (process.env.FANGYU_OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools()
    }
  } else {
    mainWindow.loadFile(FLOW_DIST)
  }

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(async () => {
  startBackend()
  try {
    await waitForBackend()
    console.log('[electron] Backend ready')
  } catch (err) {
    console.error('[electron] Backend failed to start:', err.message)
  }
  createWindow()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('window-all-closed', () => {
  stopBackend()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopBackend()
})
