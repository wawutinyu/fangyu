/**
 * 桌面开发：启动 fangyu-studio Vite → 等待就绪 → 启动 Electron

 */

const { spawn } = require('child_process')

const fs = require('fs')

const http = require('http')

const path = require('path')



const DESKTOP_ROOT = path.join(__dirname, '..')

const STUDIO_ROOT = path.join(DESKTOP_ROOT, '..', 'fangyu-studio')

const PORT = Number(process.env.FANGYU_DEV_FRONTEND_PORT) || 5173

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx'



let viteProcess = null

let electronProcess = null



function spawnLogged(cmd, args, opts) {

  return spawn(cmd, args, { stdio: 'inherit', shell: true, ...opts })

}



function waitForVite(retries = 180) {
  return new Promise((resolve, reject) => {
    function check(attempt) {
      const req = http.get(`http://localhost:${PORT}/`, (res) => {
        res.resume()
        if (res.statusCode && res.statusCode < 500) resolve()
        else if (attempt < retries) setTimeout(() => check(attempt + 1), 500)
        else reject(new Error(`Vite not ready on port ${PORT}`))
      })
      req.on('error', () => {
        if (attempt < retries) setTimeout(() => check(attempt + 1), 500)
        else reject(new Error(`Vite not ready on port ${PORT}`))
      })
      req.setTimeout(2000, () => {
        req.destroy()
        if (attempt < retries) setTimeout(() => check(attempt + 1), 500)
        else reject(new Error(`Vite not ready on port ${PORT}`))
      })
    }
    check(0)
  })
}



function cleanup(code = 0) {

  if (electronProcess) electronProcess.kill()

  if (viteProcess) viteProcess.kill()

  process.exit(code)

}



process.on('SIGINT', () => cleanup(0))

process.on('SIGTERM', () => cleanup(0))



if (!fs.existsSync(STUDIO_ROOT)) {

  console.error('[dev-runner] fangyu-studio not found at', STUDIO_ROOT)

  process.exit(1)

}



console.log('[dev-runner] Starting fangyu-studio Vite...')

viteProcess = spawnLogged(npmCmd, ['run', 'dev', '--', '--port', String(PORT), '--strictPort'], { cwd: STUDIO_ROOT })



viteProcess.on('exit', (code) => {

  if (electronProcess) electronProcess.kill()

  process.exit(code ?? 0)

})



waitForVite()

  .then(() => {

    console.log(`[dev-runner] Vite ready → launching Electron (port ${PORT})`)

    electronProcess = spawnLogged(npxCmd, ['electron', '.'], {

      cwd: DESKTOP_ROOT,

      env: {

        ...process.env,

        FANGYU_DEV_FRONTEND_PORT: String(PORT),

        FANGYU_OPEN_DEVTOOLS: '1',

      },

    })

    electronProcess.on('exit', (code) => cleanup(code ?? 0))

  })

  .catch((err) => {

    console.error('[dev-runner]', err.message)

    cleanup(1)

  })

