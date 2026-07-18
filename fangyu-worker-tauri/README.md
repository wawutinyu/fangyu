# 方隅 · 桌面原生（Tauri）

目标：**网页「序」有的功能，原生窗口里一比一都有**（同一套 `fangyu-studio` / `fangyu-canvas`，不重写 UI）。

| 能力 | 说明 |
|------|------|
| 主窗口 | 嵌入完整序 UI：Flow / Agent / 律 / 行看板 / 观 |
| API | 启动时拉起 `python -m fangyu --server`（已占用则复用） |
| Worker（行） | 托盘守护 `fangyu-worker`，真 shell / run_flow |
| 托盘 | 打开主窗口 / 重启 Worker / 退出 |
| 安装 | Windows：`install-native.bat`；macOS：`./install-native.sh` |
| 单实例 | 二次启动聚焦已有窗口 |
| 开机自启 | 托盘「开机自启（切换）」 |
| 安装包 | Windows NSIS；macOS `.app` / `.dmg` |

> 运行时仍依赖本机仓库 + Python + Node（安装包不内嵌解释器）。配置：
> - **Windows：** `%LOCALAPPDATA%\Fangyu\native.json`
> - **macOS：** `~/Library/Application Support/Fangyu/native.json`
> - 或环境变量 `FANGYU_REPO_ROOT` / `FANGYU_DATA_DIR`

## macOS 安装（推荐）

仓库根目录：

```bash
# 若无 Rust：
# curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
chmod +x install-native.sh dev-native.sh build-native.sh
./install-native.sh
```

写入 `native.json`，并创建：

- `~/Applications/Fangyu.command`
- `~/Desktop/Fangyu.command`（若有桌面目录）

日常双击启动器，或：

```bash
./dev-native.sh
```

打包：

```bash
./build-native.sh
```

产物：

- `fangyu-worker-tauri/src-tauri/target/release/bundle/macos/`
- `fangyu-worker-tauri/src-tauri/target/release/bundle/dmg/`

## Windows 安装

```bat
install-native.bat
```

检查 Node / Python / Rust，装依赖，并创建桌面与开始菜单快捷方式 **Fangyu.lnk** → `dev-native.bat`。

开发：

```bat
dev-native.bat
```

打包：

```bat
build-native.bat
```

产物：`src-tauri/target/release/bundle/nsis/*.exe`

## 前置

- Node 18+
- Python 3.10+（`pip install -e .`）
- Rust（`rustup`）

## 入口对照

| 入口 | 角色 |
|------|------|
| **`./install-native.sh` / `./dev-native.sh`** | **macOS 推荐**：原生全功能 |
| **`install-native.bat` / `dev-native.bat`** | **Windows 推荐**：原生全功能 |
| `./dev.sh` / `dev.bat` | 仅网页序 + API |
| `./install-worker.sh` / `install-worker.bat` | 仅行 Worker（无序窗口） |
