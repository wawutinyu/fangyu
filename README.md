# 方隅（fangyu）

AI 社会的基础设施 — 可视化编排 + DAG 执行引擎 + A2A 协议 + ATP 信任层。

**fangyu/ 就是项目根目录。**

## 产品双子

| 产品 | 包名 | 定位 |
|------|------|------|
| **方隅·序** | `fangyu-studio` | 编排、治理、发布 — Web 管理与设计 |
| **方隅·行** | `fangyu-worker` | 执行、连接、交付 — 本机 Worker |

> **序而后行**：在序里设计并发布，在行里本机 shell / 文件 / Adapter 真干活。  
> `fangyu-desktop`（Electron）为**可选过渡壳**，默认不必安装。

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

# 方隅·行 Worker（真执行）
dev-worker.bat

# 方隅·行 — Windows 系统托盘（原生 Shell MVP，推荐）
dev-worker-tray.bat

# Electron 过渡壳（可选）
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
├── fangyu-worker/     # 方隅·行
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
- **[L1 开发主线](docs/L1_ROADMAP.md)**
- **[Phase 5 技术方案](docs/PHASE5_TECH_SPEC.md)**
- **[Electron 过渡壳冒烟](docs/ELECTRON_SMOKE.md)**（可选）

## 已移除

| 旧路径 | 说明 |
|--------|------|
| `fangyu-flow/` | 已并入 `fangyu-canvas` |
| `fangyu-web/` | 已重命名为 `fangyu-studio`（方隅·序） |

若本地仍存在上述文件夹，先 **`dev-clean.bat`**，再 **`scripts\remove-legacy.bat`**。
