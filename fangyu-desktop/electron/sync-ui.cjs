/**
 * 将 fangyu-studio 桌面构建产物复制到 fangyu-desktop/dist（供 electron-builder 打包）
 */
const fs = require('fs')
const path = require('path')

const DESKTOP_ROOT = path.join(__dirname, '..')
const STUDIO_DIST = path.join(DESKTOP_ROOT, '..', 'fangyu-studio', 'dist')
const TARGET = path.join(DESKTOP_ROOT, 'dist')

if (!fs.existsSync(STUDIO_DIST)) {
  console.error('[sync-ui] Missing fangyu-studio/dist — run npm run build:ui first')
  process.exit(1)
}

fs.rmSync(TARGET, { recursive: true, force: true })
fs.cpSync(STUDIO_DIST, TARGET, { recursive: true })
console.log('[sync-ui] Copied fangyu-studio/dist → fangyu-desktop/dist')
