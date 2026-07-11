# fangyu

AI 工作流编排平台 — 可视化画布 + DAG 执行引擎 + A2A 协议 + ATP 信任层。

**fangyu/ 就是项目根目录。**

## 完整产品组成

| 模块 | 位置 | 说明 |
|------|------|------|
| **fangyu-flow** | `fangyu-flow/` | React 画布 — Flow 编排 + Agent 编排 |
| **执行引擎** | `engine/` | DAG 调度 + 25 种节点执行器 |
| **API 服务** | `server.py` + `routers/` | FastAPI 接口 |
| **A2A 协议** | `a2a/` | Task/Message/AgentCard + ATP 信任层 |

## 目录结构

```
fangyu/                  ← 项目根
├── __init__.py
├── __main__.py          # CLI: py -m fangyu
├── server.py            # FastAPI 入口
├── pyproject.toml
├── dev.bat              # 一键启动
├── a2a/
├── engine/
├── models/
├── routers/
├── core/
├── fangyu-flow/         # 画布 UI（React + ReactFlow）
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
└── data/
```

## 安装与启动

```bash
# 一键启动（Windows）
dev.bat

# 或手动启动：

# 1. Python 后端
py -m pip install -e .
py -m fangyu --server          # → http://localhost:8000

# 2. 画布前端 fangyu-flow
cd fangyu-flow
npm install
npm run dev                    # → http://localhost:5173
```

## 隔离原则

**属于 fangyu 的：** fangyu-flow 画布、执行引擎、API、协议层 — 全部产品代码。

**不混进来的：** 仅开发期测试脚本、CI 配置等工程杂项。
