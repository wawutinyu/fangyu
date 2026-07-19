# fangyu 用户手册

> 面向**零编程经验**用户。按顺序阅读即可完成：安装 → 画布编排 → 导出 Agent → 独立运行 → 接入外部 Agent → 产线 Demo。

**日常入口（推荐）：**
- **Windows 原生**：`install-native.bat`（一次）→ 桌面「Fangyu」；或直接 `dev-native.bat`
- **macOS 原生**：`./install-native.sh`（一次）→ `~/Applications/Fangyu.command`；或 `./dev-native.sh`（需 Rust）
- **网页序**：`./dev.sh` / `dev.bat` → http://127.0.0.1:5173
- **仅行 Worker**：`./install-worker.sh` / `install-worker.bat`  
- **macOS 网页序**：`./dev.sh` → http://127.0.0.1:5173  
- **macOS 方隅·行**：`./install-worker.sh`（一次）→ 双击 `~/Applications/Fangyu-Worker.command`  
- **仅网页序（Win）**：`dev.bat` → http://localhost:5173  
- **仅行托盘（Win）**：`install-worker.bat`（首次）→ `dev-worker-tray.bat`  
- **方隅·观 / 律**：原生或网页顶栏「观」「律」

技术细节请参阅 [L1 路线图](L1_ROADMAP.md)、[Adapter 开发指南](ADAPTER_DEV_GUIDE.md)、[愿景·四门两包](VISION_AND_PRODUCT.md)、[扔 Electron 检查清单](ELECTRON_RETIREMENT.md)。

---

## 1. fangyu 是什么？

fangyu 是一个 **AI Agent 编排平台**。你可以把它理解成：

- **Flow 画布** — 像画流程图一样编排节点，定义 Agent **怎么干活**（搭 Harness：顶栏 **创建 → 节点编排 · Harness**，用记忆/计划/执行/验收等节点拼，不是单点黑盒）
- **Agent 画布** — 像组织架构图一样，把多个 Agent 连起来，定义 **谁和谁协作**
- **导出 Bundle** — 把 Agent 打包成独立程序，**不打开 fangyu 界面也能运行**
- **A2A 协议** — Agent 之间用标准方式互相调用（像打电话有统一号码规则）

一句话：**在画布上设计能干活的 Agent，导出后独立运行，还能和其他 Agent 组网协作。**

---

## 2. 环境要求

| 项目 | 要求 |
|------|------|
| 操作系统 | Windows 10/11 或 macOS（下面分系统写） |
| Python | 3.10 或以上（推荐 3.12+） |
| Node.js | 18 或以上（用于前端画布） |
| 浏览器 | Chrome / Edge / Safari 最新版 |

检查是否已安装：

```powershell
# Windows
py --version
node --version
```

```bash
# macOS
python3 --version
node --version
# 可选：source scripts/mac-env.sh
```

---

## 3. 第一次启动（5 分钟）

### 3.1 获取项目

将 `fangyu` 文件夹放到任意目录，例如 `C:\Users\你\Desktop\fangyu`。

### 3.2 一键启动

双击项目根目录下的 **`dev.bat`**，或在 PowerShell 中：

```powershell
cd C:\Users\你\Desktop\fangyu
.\dev.bat
```

脚本会自动：

1. 安装 Python 依赖
2. 启动后端 API（端口 **8000**）
3. 启动 **方隅·序** `fangyu-studio`（端口 **5173**）

### 3.3 打开界面

浏览器访问：**http://localhost:5173**

| 地址 | 用途 |
|------|------|
| http://localhost:5173 | 方隅·序 — 可视化设计台 |
| http://localhost:8000/docs | API 文档（进阶用户） |

> 若 5173 打不开或界面是旧版「fangyu — AI Flow Canvas」，先运行 **`dev-clean.bat`** 再 **`dev.bat`**。

### 3.4 手动启动（可选）

```powershell
# 终端 1 — 后端
cd fangyu
py -m pip install -e .
py -m fangyu --server

# 终端 2 — 前端（项目根目录）
cd fangyu
npm install
npm run dev
```

---

## 4. 界面导览

顶部主入口按 **序 · 律 · 行 · 观** 排布；Agent 编排在 **序** 的二级切换里：

| 入口 | 作用 |
|------|------|
| **序 · 流程** | 设计单条工作流（节点 DAG） |
| **序 · Agent** | 设计多个 Agent 如何协作 |
| **律** | 宪法与审计 |
| **行** | Worker 看板：谁在线、在干什么 |
| **观** | 多 Agent / Worker 协作现场 |

底部或侧边通常有：

- **Chat** — 与 Flow 或 Agent 对话测试
- **设置** — 宪法、LLM 配置等
- **工具栏** — 保存、导入、导出、模拟运行

---

## 5. Flow 画布：设计 Agent 怎么干活

### 5.1 基本操作

1. 从左侧 **节点库** 拖拽节点到画布（如「开始」「代码」「输出」）
2. 拖动连线把节点首尾相连
3. 点击节点，在右侧 **配置面板** 修改参数
4. 用下面两种方式之一测试流程（**不是同一个引擎**）

### 5.1.1 预览怎么跑

工具栏 **「预览」** 与底部 **「预览」→ Flow 聊天** 走**同一后端引擎**（`/api/v1/flow/run/stream`）。

| 入口 | 用法 |
|------|------|
| 底部 Flow 聊天发一句 | 把这句话当输入跑 Flow（推荐） |
| 工具栏「预览」 | 无聊天文案；input 节点用默认值 |

日常任选其一即可；验收仍建议两条都点过，见 [HAPPY_PATH_ACCEPTANCE.md](HAPPY_PATH_ACCEPTANCE.md) 步骤 4a / 4b。

意图生成「应用到画布」后，也会提示你去预览。

> BatchRunner / 部分单测仍用浏览器本地沙箱（`localExecutor`），与工具栏预览无关。

### 5.2 推荐：Action-first（能干活，不只聊天）

默认 Worker Agent 的技能流程是：

```
开始 → 代码（执行逻辑）→ 输出
```

而不是纯「开始 → LLM → 输出」。LLM 适合放在中间做规划，**终点应该是能验证的结果**（改数据、调 API、跑代码等）。

常用节点举例：

| 节点 | 用途 |
|------|------|
| 代码 | 执行 Python 逻辑（沙箱内） |
| HTTP | 调用外部 API |
| 工具调用 | 调用注册的工具 |
| LLM | 大模型推理（规划/总结） |
| 条件 / 循环 | 分支与重试 |

### 5.3 保存与加载

- **Ctrl+S** 或工具栏「保存」— 保存当前 Flow 到项目
- 「导入」— 从 JSON 文件恢复流程

---

## 6. Agent 编排：多 Agent 协作

在顶部进入 **序**，再切换到 **Agent**（二级）。

### 6.1 添加 Agent

点击 **「+ 智能体」**，画布会出现一个紫色 Agent 节点。

选中节点，右侧配置面板可设置：

| 配置项 | 说明 |
|--------|------|
| **Agent 类型** | Worker（只对内 A2A）/ Interface（面向用户）/ Hybrid（两者兼有） |
| **AgentCard** | 名称、描述、技能列表 |
| **绑定 Flow 画布** | 把 Flow 画布里设计的流程绑到某个 skill 上 |

### 6.2 绑定技能流程

1. 先在 **Flow 画布** 设计好流程
2. 回到 **Agent 编排**，选中 Agent → AgentCard → 某技能 → **「绑定 Flow 画布」**

未绑定的技能会使用默认的 action 流程（代码节点处理输入）。

### 6.3 路由器与协作链

点击 **「+ 路由器」**，配置路由规则：

- **来源 Skill** — 上游技能 ID（如 `web_search`）
- **目标 Agent** — 下一个 Agent 节点

配置 **2 条以上规则** 后，Chat 里可开启 **协作模式**，自动按顺序调用多个 Agent。

快捷方式：点击 **「加载 AI 社会 Demo」** 查看搜索 → 分析 → 汇总的示例。

### 6.4 在 Chat 里测试 Agent

1. 底部 Chat 切换到 **Agent 模式**
2. 若有多 Agent 路由，打开 **协作模式**
3. 输入问题并发送 — 平台会自动部署 Agent 并执行

---

## 7. 导出 Agent Bundle（独立运行包）

Bundle 是 fangyu 签发的 **标准 Agent 安装包**，包含：身份密钥、宪法快照、技能流程、启动脚本。

### 7.1 从画布导出

1. 在 **Agent 编排** 中选中一个 **本厂智能体** 节点
2. 点击 **「导出 Bundle」**
3. 浏览器会下载 `名称.bundle.zip`

### 7.2 解压后的结构

```
my-agent/
├── manifest.json       # 包信息与 agent_id
├── agent.card.json     # Agent 能力描述
├── identity.json       # Ed25519 密钥 + 宪法签名
├── constitution.json   # 社会契约快照
├── skills/default/flow.json
├── config/interfaces.json
├── start.bat           # Windows 一键启动
└── start.sh            # Linux/Mac 启动
```

### 7.3 独立运行（无需 fangyu 界面）

解压 zip，进入目录：

```powershell
# 方式 1：双击 start.bat

# 方式 2：命令行
py -3 -m fangyu --run-bundle C:\path\to\my-agent --port 9001
```

启动后：

| 地址 | 说明 |
|------|------|
| http://127.0.0.1:9001/health | 健康检查 |
| http://127.0.0.1:9001/rpc | A2A JSON-RPC 接口 |

验证：

```powershell
py -3 scripts/bundle_demo.py --port 9100
```

---

## 8. 接入外部 Agent

外部 Agent 是 **不在本机 fangyu 里设计、但经授权可加入协作网络** 的 Agent（例如另一台机器上运行的 Bundle）。

### 8.1 添加外部 Agent 节点

1. Agent 画布 → **「+ 外部 Agent」**（橙色虚线边框）
2. 选中节点 → 右侧 **「外部接入」** 面板

### 8.2 填写连接信息

| 字段 | 说明 | 从哪里获取 |
|------|------|------------|
| **RPC URL** | 外部 Agent 的 RPC 地址 | 如 `http://192.168.1.20:9001/rpc` |
| **远程 Agent 名称** | 对方 Agent 的名字 | 对方 `/health` 或 `agent.card.json` 里的 name |
| **平台 Agent ID** | 对方身份 ID | 对方 `identity.json` → `agent_id` |
| **公钥 (hex)** | 对方公钥 | 对方 `identity.json` → `public_key` |

可点击 **「发现远程 AgentCard」** 自动拉取部分信息（需对方服务已启动）。

### 8.3 授权

勾选 **「授权接入」** — 只有授权后的外部 Agent 才会被协作链调用。

### 8.4 加入协作

- 在 **路由器** 里把某条规则的目标设为此外部 Agent
- 或在 Chat Agent 模式中选择该 Agent 单独调用

---

## 9. 产线 Demo（PLC → Worker Agent）

演示 **工业传感器事件 → Worker 分析 → 自动下发控制指令**，无需真实 PLC 硬件。

### 9.1 运行

确保 `py -m fangyu --server` 已启动，然后：

```powershell
py -3 scripts/plc_demo.py
```

### 9.2 发生了什么？

```
温度 35°C  →  Worker 输出 OK:temperature=35.0
温度 95°C  →  Worker 输出 ALARM:temperature=95.0  →  PLC 自动 motor_speed=0（降速）
```

### 9.3 相关 API（进阶）

| 接口 | 作用 |
|------|------|
| `POST /api/v1/adapters/plc/register_worker` | 注册产线 Worker |
| `POST /api/v1/adapters/plc/dispatch` | 发送 PLC 事件给 Worker |

详见 [Adapter 开发指南](ADAPTER_DEV_GUIDE.md)。

---

## 10. 宪法与社会规则

fangyu 的 Agent 受 **宪法（constitution）** 约束，防止危险操作。

### 10.1 查看与编辑

**设置 → 宪法** — 可查看策略、切换 warn（警告）/ deny（拒绝）模式、使用策略模板。

### 10.2 违宪提示

- Flow **模拟运行** 后，若有违宪行为会弹出警告
- Chat 中会显示 **ViolationPanel** 说明被拒绝的原因

导出的 Bundle 会携带宪法快照，独立运行时同样生效。

---

## 11. 典型工作流速查

### 工作流 A：做一个只干活的 Worker

```
Flow 画布：开始 → 代码 → 输出
    ↓
Agent 编排：+ 智能体，类型选 Worker，绑定 skill
    ↓
导出 Bundle → 独立运行
```

### 工作流 B：多 Agent 协作

```
Agent 编排：添加 3 个 Agent + 1 个路由器
    ↓
每个 Agent 绑定不同 Flow 技能
    ↓
路由器配置：skill A → Agent2，skill B → Agent3 …
    ↓
Chat 协作模式发送任务
```

### 工作流 C：本厂 + 外部混合

```
本厂 Agent（Flow 设计） + 外部 Agent（填 RPC/公钥/授权）
    ↓
路由器指向外部节点
    ↓
Chat 或 API 触发编排
```

---

## 12. 常见问题

### Q：画布打不开 / 一直转圈？

- 确认后端 `http://localhost:8000/api/health` 返回 `{"status":"ok"}`
- 确认前端 `npm run dev` 无报错
- 关闭防火墙对 8000/5173 的拦截

### Q：模拟运行 / 预览没反应？

- 检查 Flow 是否有「开始」节点且已连线
- **先确认 API 在跑**（`http://localhost:8000/api/health`）；502 时底部聊天会失败，容易误判成「预览坏了」
- 工具栏「预览」与底部 Flow 聊天已统一为后端真跑；502 时两边都会失败
- 看底部是否误停在 Agent 聊天、或只展开了执行日志

### Q：Agent Chat 说「请先添加 Agent」？

- 切换到 Agent 编排 Tab，至少添加一个智能体
- Chat 切换到 Agent 模式

### Q：导出 Bundle 失败？

- 需先选中 Agent 编排里的 **本厂智能体** 节点（不是路由器/外部 Agent）
- 后端必须在运行（dev.bat 或 `--server`）

### Q：外部 Agent 调用失败？

- 检查 RPC URL 能否访问（浏览器打开 `http://.../health`）
- 确认已 **授权接入**
- 若对方 Bundle 开启了加密通信（`require_envelope`），需带签名信封调用（见 [A2A 远程文档](A2A_REMOTE.md)）

### Q：Bundle 启动后如何被调用？

```powershell
# 向 Bundle 发 A2A 消息（示例）
curl -X POST http://127.0.0.1:9001/rpc -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"method\":\"a2a.send_message\",\"params\":{\"targetAgent\":\"你的Agent名\",\"message\":{\"role\":\"user\",\"parts\":[{\"type\":\"text\",\"text\":\"hello\"}],\"metadata\":{\"skill_id\":\"default\"}}},\"id\":1}"
```

---

## 13. 进一步阅读

| 文档 | 适合谁 |
|------|--------|
| [VISION_AND_PRODUCT.md](VISION_AND_PRODUCT.md) | 愿景与四门两包（序/行/观/律） |
| [L1_ROADMAP.md](L1_ROADMAP.md) | 了解产品方向与技术阶段 |
| [A2A_REMOTE.md](A2A_REMOTE.md) | 跨机器 RPC 调用 |
| [ADAPTER_DEV_GUIDE.md](ADAPTER_DEV_GUIDE.md) | 开发 MQTT/OPC-UA 等 Adapter 插件 |
| [ELECTRON_RETIREMENT.md](ELECTRON_RETIREMENT.md) | Electron 过渡壳退役存档（已删包） |

---

## 14. 获取帮助

- API 交互式文档：http://localhost:8000/docs
- 运行测试确认环境正常：`py -3 -m pytest tests/unit/ -q`

---

*手册版本：v1.0 — 覆盖 L1 Phase 1–4 用户可见功能。如有界面更新，以实际产品为准。*
