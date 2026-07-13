# 方隅（fangyu）

AI 社会的基础设施 — 可视化编排 + DAG 执行引擎 + A2A 协议 + ATP 信任层。

**fangyu/ 就是项目根目录。**

## 产品：四门两包

> **方隅：序以设计，行以执行，观以察局，律以约束。**  
> 详情见 **[愿景与产品 · 四门两包](docs/VISION_AND_PRODUCT.md#30-产品交付模型四门两包2026-07-锁定)**。

| 门 | 定位 | 交付 |
|----|------|------|
| **方隅·序** | 编排、发布、意图生成 | `fangyu-studio`（序包） |
| **方隅·观** | 多 Agent 协作现场 | 序包顶栏「方隅·观」· `GET /api/v1/presence` |
| **方隅·律** | 宪法、信任、审计 | 序包顶栏「方隅·律」 |
| **方隅·行** | 本机真执行 | `fangyu-worker`（行包） |

```
四门:  序 ── 观 ── 律 ── 行
两包:  └─ studio ─┘      worker
```

> **序而后行**：在序里设计并发布，在行里本机 shell / 文件 / Adapter 真干活。  
> **观 / 律** 叙事与序、行并列，工程上先挂在序包，不急着第三安装包。  
> `fangyu-desktop`（Electron）为**可选过渡壳**；退役门槛见 **[扔 Electron 检查清单](docs/ELECTRON_RETIREMENT.md)**。

## MQTT → 行（可选）

复制 `data/worker-mqtt-triggers.example.json` 为 `data/worker-mqtt-triggers.json` 并设 `"enabled": true`，  
API 启动后会监听 `mqtt_sim` 主题并自动派发 Worker 任务。也可在 **方隅·行** 面板点「测试 MQTT→行」。

## Intent → Flow（Phase 6 MVP）

在 **方隅·序** 工具栏点 **「意图生成」**，输入自然语言目标（如「完成巡检并写入结果」），  
生成 action-first 画布 Flow 并做宪法扫描，通过后可应用到画布，再 **序内预览** 或 **派发至行**。

API：`POST /api/v1/intent/to-flow`

## 安装与启动

```bash
# 根目录一次安装
npm install
py -m pip install -e .

# 端口被占用或界面是旧版时，先清理
dev-clean.bat

# 方隅·序 + API（主入口）
dev.bat
# → http://localhost:5173  标题应显示「方隅·序」

# 方隅·行 — 首次安装（检查 Node + 桌面快捷方式）
install-worker.bat

# 方隅·行 Worker（真执行）
dev-worker.bat

# 方隅·行 — Windows 系统托盘（过渡：PowerShell）
dev-worker-tray.bat

# 方隅·行 — Tauri 原生托盘壳（P1，需 Rust + MSVC）
dev-worker-tauri.bat

# Electron 过渡壳（可选，计划退役）
dev-desktop.bat
```

## 目录结构

```
fangyu/
├── engine/            # DAG 执行引擎
├── core/              # 宪法 + 审计 + Worker 注册表
├── a2a/               # A2A 协议 + ATP 信任
├── adapters/          # 物理层 Adapter 插件
├── fangyu-core/       # 共享内核（@fangyu/core）
├── fangyu-canvas/     # 共享画布 UI
├── fangyu-studio/     # 方隅·序
├── fangyu-worker/     # 方隅·行（Node 守护进程）
├── fangyu-worker-tauri/ # 方隅·行 Tauri 托盘壳（P1）
├── fangyu-desktop/    # Electron 过渡壳（可选，deprecated）
├── scripts/           # Demo 脚本
└── data/              # constitution.json, assets/
```

## 测试

```bash
py -m pytest tests/unit/ -q
npm run test
npm run build:studio

# 序 → 行 Happy Path（shell + run_flow，需 API + Worker）
py scripts/worker_happy_path.py --spawn-worker
```

## 文档

- **[用户手册](docs/USER_GUIDE.md)**
- **[愿景与产品（四门两包）](docs/VISION_AND_PRODUCT.md)**
- **[L1 开发主线](docs/L1_ROADMAP.md)**
- **[Happy Path 验收清单](docs/HAPPY_PATH_ACCEPTANCE.md)**
- **[Phase 5 技术方案](docs/PHASE5_TECH_SPEC.md)**
- **[扔 Electron 检查清单](docs/ELECTRON_RETIREMENT.md)**
- **[Electron 过渡壳冒烟](docs/ELECTRON_SMOKE.md)**（可选）

## 已移除

| 旧路径 | 说明 |
|--------|------|
| `fangyu-flow/` | 已并入 `fangyu-canvas` |
| `fangyu-web/` | 已重命名为 `fangyu-studio`（方隅·序） |

若本地仍存在上述文件夹，先 **`dev-clean.bat`**，再 **`scripts\remove-legacy.bat`**。
