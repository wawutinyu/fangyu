@echo off
REM 方隅·行 — Tauri 托盘壳（需已安装 Rust + Node）
cd /d "%~dp0"
if not exist fangyu-worker-tauri\node_modules (
  echo [fangyu] 安装 fangyu-worker-tauri 依赖...
  pushd fangyu-worker-tauri && call npm install && popd
)
echo [方隅·行] 启动 Tauri 开发壳…
echo   需 API: py -m fangyu --server 或 dev.bat
cd fangyu-worker-tauri
call npx tauri dev
