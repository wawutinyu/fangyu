import { spawn } from 'node:child_process'
import os from 'node:os'

/**
 * @param {import('@fangyu/core').ShellExecOptions} options
 * @returns {Promise<import('@fangyu/core').ShellExecResult>}
 */
export function execShell(options) {
  const timeoutMs = options.timeoutMs ?? 60_000
  const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh'
  const shellFlag = process.platform === 'win32' ? '/c' : '-c'

  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false

    const child = spawn(shell, [shellFlag, options.command], {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
      windowsHide: true,
    })

    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)

    child.stdout?.on('data', (chunk) => { stdout += String(chunk) })
    child.stderr?.on('data', (chunk) => { stderr += String(chunk) })

    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
        timedOut,
      })
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({
        stdout,
        stderr: stderr || err.message,
        exitCode: 1,
        timedOut,
      })
    })
  })
}

export function defaultWorkerName() {
  return `${os.hostname()}-worker`
}
