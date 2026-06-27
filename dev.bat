@echo off
REM fangyu 开发服务器启动脚本
REM ==========================
REM 同时启动：
REM   1. 后端 FastAPI（端口 8000，带热重载）
REM   2. 前端 Vite 开发服务器（端口 5173，自动代理 /api 到后端）
REM
REM 使用方法：
REM   double-click dev.bat 或在终端运行 dev.bat
REM
REM 注意事项：
REM   - 关闭窗口即停止所有服务。
REM   - 如需单独启动，分别执行：
REM       cd backend && py run.py
REM       cd frontend && npm run dev
REM   - Electron 桌面版：cd frontend && npm run electron:dev
REM     自动启动后端 + 前端 + Electron 窗口

echo [fangyu] Starting backend (FastAPI) on port 8000...
cd /d "%~dp0backend"
start "fangyu-backend" cmd /c "py run.py"

echo [fangyu] Starting frontend (Vite) on port 5173...
cd /d "%~dp0frontend"
start "fangyu-frontend" cmd /c "npm run dev"

echo [fangyu] Both servers started!
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:5173
echo   API Docs: http://localhost:8000/docs
echo.
echo Close this window to stop all services.
pause
