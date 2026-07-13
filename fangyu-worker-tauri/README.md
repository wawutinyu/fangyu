# 方隅 · Windows 原生（Tauri）

第一阶段目标：**网页「序」有的功能，原生窗口里一比一都有**（同一套 `fangyu-studio` / `fangyu-canvas`，不重写 UI）。

| 能力 | 说明 |
|------|------|
| 主窗口 | 嵌入完整序 UI：Flow / Agent / 律 / 行看板 / 观 |
| API | 启动时拉起 `py -m fangyu --server`（已占用则复用） |
| Worker（行） | 托盘守护 `fangyu-worker`，真 shell / run_flow |
| 托盘 | 打开主窗口 / 重启 Worker / 退出 |
| 安装 | `install-native.bat` → 桌面「Fangyu」+ `%LOCALAPPDATA%\Fangyu\native.json` |
| 单实例 | 二次启动聚焦已有窗口 |
| 开机自启 | 托盘「开机自启（切换）」 |
| 安装包 | `build-native.bat` → NSIS |

Web 与原生的长期分工**以后再定**；现阶段原生 = 全功能壳。

> 运行时仍依赖本机仓库 + Python + Node（安装包不内嵌解释器）。配置：
> - `%LOCALAPPDATA%\Fangyu\native.json` — `repo_root` / `data_dir`
> - 或环境变量 `FANGYU_REPO_ROOT` / `FANGYU_DATA_DIR`

## 安装（推荐）

仓库根目录：

```bat
install-native.bat
```

检查 Node / Python / Rust，装依赖，并创建桌面与开始菜单快捷方式 **Fangyu.lnk** → `dev-native.bat`。

## 开发启动

```bat
dev-native.bat
```

或手动：

1. `py -m fangyu --server`
2. `npm run dev`（序 Vite :5173）
3. `cd fangyu-worker-tauri && npx tauri dev`

## 打包

```bat
build-native.bat
```

或：

```bat
cd fangyu-worker-tauri
npx tauri build
```

产物：`src-tauri/target/release/bundle/nsis/*.exe`

安装 NSIS 后仍需本机 clone（`install-native.bat` 写入 `native.json`），否则找不到 Worker/API。

## 前置

- Node 18+
- Python 3.10+（`pip install -e .`）
- Rust + MSVC（`rustup`）

## 与 Electron / 旧托盘壳

| 入口 | 角色 |
|------|------|
| **`install-native.bat` / `dev-native.bat`** | **推荐**：Windows 原生全功能 |
| `dev.bat` | 仅网页序 + API |
| `install-worker.bat` | 仅行托盘 |
