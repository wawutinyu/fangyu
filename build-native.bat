@echo off
REM 方隅 — 打 NSIS 安装包（需 Rust + Node + Python 已就绪）
cd /d "%~dp0"

where rustc >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 Rust。请先安装 https://rustup.rs/
  pause
  exit /b 1
)

echo [方隅] 构建 Studio (TAURI=1) + NSIS 安装包...
cd fangyu-worker-tauri
call npx tauri build
if errorlevel 1 (
  echo [错误] tauri build 失败
  pause
  exit /b 1
)

echo.
echo [完成] 安装包大致位于:
echo   fangyu-worker-tauri\src-tauri\target\release\bundle\nsis\
echo 安装后请先在本机跑过 install-native.bat（写入仓库路径），或设置 FANGYU_REPO_ROOT。
echo.
