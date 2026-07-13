@echo off
REM 方隅 — Windows 原生（Tauri）第一阶段：序 UI 1:1 + API + Worker
cd /d "%~dp0"

if not exist node_modules (
  echo [fangyu] 安装根依赖...
  call npm install
)

where rustc >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 Rust。请先安装 https://rustup.rs/
  pause
  exit /b 1
)

echo [方隅] 检查 / 启动 API :8000 ...
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri http://127.0.0.1:8000/api/health -UseBasicParsing -TimeoutSec 2).StatusCode } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
  start "fangyu-api" cmd /c "cd /d %~dp0 && py -m fangyu --server"
  timeout /t 2 /nobreak >nul
)

echo [方隅] 检查 / 启动 序 Vite :5173 ...
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri http://localhost:5173/ -UseBasicParsing -TimeoutSec 2).StatusCode } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
  start "fangyu-studio" cmd /c "cd /d %~dp0 && npm run dev"
  echo   等待 Vite 就绪...
  timeout /t 5 /nobreak >nul
)

echo [方隅] 启动 Tauri 原生窗口（功能与网页序 1:1）...
cd fangyu-worker-tauri
call npx tauri dev
