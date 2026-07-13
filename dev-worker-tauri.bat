@echo off
REM 方隅·行 — 旧 Tauri 入口（仍可用）
REM 完整体验请用仓库根目录：dev-native.bat（序 UI 1:1 + API + Worker）
cd /d "%~dp0"
if not exist fangyu-worker-tauri\node_modules (
  echo [fangyu] 安装 fangyu-worker-tauri 依赖...
  pushd fangyu-worker-tauri && call npm install && popd
)
echo [提示] 推荐改用根目录 dev-native.bat（会先确保 API + Vite）
echo [方隅] 启动 Tauri…
cd fangyu-worker-tauri
call npx tauri dev
