# fangyu

AI 社会的基础设施 — 可视化编排 + DAG 执行引擎 + A2A 协议 + ATP 信任层。

**fangyu/ 就是项目根目录。**

## 项目目的

用本平台构建一个完整的 **AI 社会**：

- 每个导出的智能体都是与人类交互的**独立节点**
- 通过 **A2A 协议**相互协作
- 受共同的**法律与道德规范**约束
- 最终价值目标：**为人类服务**

## 当前能力一览

| 能力 | 状态 |
|------|------|
| Flow / Agent 双画布 | ✅ |
| 28 种节点执行引擎 | ✅ |
| 导出 Python 代码（export↔engine parity，10 fixture） | ✅ |
| 安全表达式（AST 白名单，无 eval） | ✅ |
| 宪法可组合策略 + warn/deny + 策略模板 | ✅ |
| 画布违宪警告 UI | ✅ |
| 审计链 hash 防篡改 | ✅ |
| 多 Agent 链式协作 + 跨 RPC demo | ✅ |
| Agent Bundle 导出 + 独立运行时 + 加密 A2A | ✅ |
| 外部 Agent 联邦编排 | ✅ |
| 多模态 Payload + 物理 Adapter 插件 | ✅ |
| 真实 MQTT Adapter（`fangyu[mqtt]`） | ✅ |

详见：

- **[用户手册](docs/USER_GUIDE.md)** ← 零经验入门（安装 → 编排 → 导出 → 组网）
- **[项目评估](docs/PROJECT_ASSESSMENT.md)** ← 阶段性看法与优先级建议
- **[L1 开发主线与技术方案](docs/L1_ROADMAP.md)** ← 后续开发北极星
- **[Phase 5 技术方案](docs/PHASE5_TECH_SPEC.md)** ← Happy Path / CLI / Daemon 设计
- **[安全模型 v1](docs/SECURITY_MODEL.md)** ← 密钥、信封、授权拍板
- **[集成 Cookbook](docs/INTEGRATION_COOKBOOK.md)** ← curl / CLI / Python 集成示例
- [愿景与产品方向](docs/VISION_AND_PRODUCT.md)
- [跨机器 A2A](docs/A2A_REMOTE.md)
- [Adapter 开发指南](docs/ADAPTER_DEV_GUIDE.md)

## 安装与启动

```bash
# 一键启动（Windows）
dev.bat

# 或手动：
py -m pip install -e .
py -m fangyu --server          # → http://localhost:8000

cd fangyu-flow && npm install && npm run dev   # → http://localhost:5173
```

## 演示脚本

```bash
# Phase 5 Happy Path（Bundle → daemon → 本地 RPC → 跨 Bundle 加密 RPC）
py -3 scripts/happy_path_demo.py

# Agent Bundle 本地演示
py -3 scripts/bundle_demo.py

# Bundle CLI
py -3 -m fangyu bundle run ./my-agent.bundle --port 9001 --daemon
py -3 -m fangyu bundle rpc ./my-agent.bundle --url http://127.0.0.1:9001/rpc -m "hello"
py -3 -m fangyu bundle trust add ./worker.bundle --from ./caller.bundle

# 跨机器单 Agent RPC
py -3 scripts/a2a_remote_demo.py --base http://127.0.0.1:8000

# 产线 PLC → Worker Agent demo
py -3 scripts/plc_demo.py --base http://127.0.0.1:8000

# MQTT → Worker（默认 sim；--real 需 broker + fangyu[mqtt]）
py -3 scripts/mqtt_demo.py --base http://127.0.0.1:8000
```

## 测试

```bash
py -3 -m pytest tests/unit/ -q
cd fangyu-flow && npm run test:fast && npm run test:slow
```

## 目录结构

```
fangyu/
├── engine/          # DAG 执行引擎
├── core/            # 宪法 + 审计链
├── a2a/             # A2A 协议 + ATP 信任
├── adapters/        # 物理层 Adapter 插件 (MQTT/OPC-UA/PLC 模拟)
├── fangyu-flow/     # React 画布
├── scripts/         # A2A demo
└── data/            # constitution.json, audit.log
```
