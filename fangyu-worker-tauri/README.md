# 方隅·行 · Tauri 壳（MVP）

Windows 原生托盘壳，产品名 **方隅·行**。负责：

- 系统托盘菜单：打开方隅·序 / 重启 Worker / 状态窗口 / 退出
- 拉起本机 `node fangyu-worker/src/cli.mjs`
- 关闭窗口时隐藏到托盘（不杀进程）

PowerShell 托盘（`dev-worker-tray.bat`）仍是过渡方案；本目录是 P1 原生壳方向。

## 前置

| 依赖 | 说明 |
|------|------|
| Node.js 18+ | 前端 + Worker |
| Rust (rustup) | `rustc` / `cargo` |
| MSVC Build Tools | Windows 链接器（`tauri build`） |

## 开发

仓库根目录：

```bat
dev-worker-tauri.bat
```

或：

```bash
cd fangyu-worker-tauri
npm install
npx tauri dev
```

环境变量（可选）：

| 变量 | 默认 |
|------|------|
| `FANGYU_API_BASE` | `http://127.0.0.1:8000` |
| `FANGYU_STUDIO_URL` | `http://127.0.0.1:5173` |

请先启动序 API（`dev.bat` 或 `py -m fangyu --server`），再开本壳。

## 打包

```bash
cd fangyu-worker-tauri
npx tauri build
```

产物：

| 文件 | 说明 |
|------|------|
| `src-tauri/target/release/fangyu-worker-tauri.exe` | 可直接跑的托盘壳 |
| `src-tauri/target/release/bundle/nsis/方隅·行_0.1.0_x64-setup.exe` | NSIS 安装包 |

网络不稳时包内 `.cargo/config.toml` 使用 rsproxy 拉 crates。安装包默认只打 NSIS（不打 MSI，避免 WiX 下载卡住）。
## 与 Worker 包关系

| 包 | 角色 |
|----|------|
| `fangyu-worker/` | 真执行守护进程（Node） |
| `fangyu-worker-tauri/` | 原生壳 + 托盘 UX |
| `fangyu-desktop/` | Electron 过渡壳（计划退役） |
