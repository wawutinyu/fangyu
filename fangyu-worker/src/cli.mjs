#!/usr/bin/env node
import os from 'node:os'
import { runWorkerDaemon } from './daemon.mjs'

function parseArgs(argv) {
  let apiBase = process.env.FANGYU_API_BASE || 'http://127.0.0.1:8000'
  let name = process.env.FANGYU_WORKER_NAME || `${os.hostname()}-worker`

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--api-base' && argv[i + 1]) {
      apiBase = argv[++i]
    } else if (arg === '--name' && argv[i + 1]) {
      name = argv[++i]
    } else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
  }

  return { apiBase: apiBase.replace(/\/$/, ''), name }
}

function printHelp() {
  console.log(`方隅·行 Worker 守护进程

用法:
  node src/cli.mjs [--api-base URL] [--name NAME]

环境变量:
  FANGYU_API_BASE     序 API 地址（默认 http://127.0.0.1:8000）
  FANGYU_WORKER_NAME  Worker 显示名
`)
}

const opts = parseArgs(process.argv)

runWorkerDaemon(opts).catch((err) => {
  console.error('[方隅·行] 启动失败:', err.message)
  process.exit(1)
})
