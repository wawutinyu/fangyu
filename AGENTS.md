# fangyu — AI Flow Canvas

可视化 AI 工作流编排工具，对标 Dify/Coze。

## 项目结构（前后端分离）

```
.
├── frontend/               # React + Vite + React Flow
│   ├── src/
│   │   ├── components/     # React 组件（TSX）
│   │   ├── store/          # Redux Toolkit
│   │   ├── utils/          # 工具函数（TS）
│   │   └── styles/         # 全局样式
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts      # 含 /api 代理到后端 8000
│
├── backend/                # Python + FastAPI
│   ├── app/
│   │   ├── main.py         # 应用入口 + 路由注册
│   │   ├── core/config.py  # 集中配置（.env + 环境变量）
│   │   ├── models/         # SQLAlchemy 数据模型
│   │   ├── routers/        # API 路由（flow/llm/settings/knowledge/project）
│   │   └── services/       # 业务逻辑层（LLM 代理、知识库、沙箱）
│   ├── run.py              # 开发启动脚本
│   └── requirements.txt
│
├── dev.bat                 # 一键启动前后端（热重载）
├── AGENTS.md
└── .gitignore
```

## 开发启动

```bash
# 方式一：一键启动（推荐）
dev.bat

# 方式二：分别启动
cd backend && py run.py          # 后端 http://localhost:8000
cd frontend && npm run dev        # 前端 http://localhost:5173
```

两个服务都是热重载的——改代码后自动刷新。

## API 设计

版本化：`/api/v1/{resource}/{action}`

| 端点 | 说明 | 状态 |
|------|------|------|
| `GET /api/health` | 健康检查 | ✅ |
| `POST /api/v1/flow/execute` | 执行流程 | ⬜ 骨架 |
| `POST /api/v1/flow/execute-code` | 执行代码沙箱 | ✅ |
| `POST /api/v1/llm/chat` | LLM 聊天代理 | ✅ |
| `POST /api/v1/llm/chat/stream` | LLM 流式聊天（SSE） | ✅ |
| `GET /api/v1/llm/models` | 模型列表 | ✅ 静态 |
| `GET /api/v1/settings/` | 获取设置 | ✅ |
| `PUT /api/v1/settings/` | 保存设置 | ✅ |
| `GET /api/v1/projects/` | 项目列表 | ✅ |
| `POST /api/v1/projects/` | 创建项目 | ✅ |
| `PUT /api/v1/projects/{id}` | 更新项目 | ✅ |
| `DELETE /api/v1/projects/{id}` | 删除项目 | ✅ |
| `GET /api/v1/projects/{id}/saves` | 保存历史列表 | ✅ |
| `POST /api/v1/projects/{id}/saves` | 创建保存 | ✅ |
| `DELETE /api/v1/projects/saves/{id}` | 删除保存 | ✅ |
| `POST /api/v1/knowledge/upload` | 上传文档 | ✅ |
| `GET /api/v1/knowledge/docs` | 文档列表 | ✅ |
| `DELETE /api/v1/knowledge/docs/{id}` | 删除文档 | ✅ |
| `POST /api/v1/knowledge/search` | 知识库检索 | ✅ |

## 会话记录

### 2026-06-25 — Vue → React + React Flow 完整前端迁移

**背景**: 用户要求放弃 Vue 3 + Vue Flow，改用 React + React Flow + Redux Toolkit。

**改动文件**（全部新建，删除旧 Vue 文件）：
- `frontend/` — 整个目录重新初始化

**做了什么**:
- 用 Vite 的 `react-ts` 模板重建 `frontend/`
- 前端框架：React 19 + TypeScript + Vite 8
- 状态管理：Redux Toolkit（3 个 slice，TypeScript 安全）
- 画布引擎：React Flow v11（`reactflow` 包）
- 自定义节点：AtomNode（带分类色标的通用 AI 节点）、CompositeNode（组合原子）
- 组件完整迁移清单：
  - `App.tsx` — 主布局（顶栏 + 侧栏 + 画布 + 配置面板 + 底栏 + 弹窗）
  - `FlowCanvas.tsx` — 核心画布（forwardRef + useImperativeHandle 暴露 API）
  - `NodeLibrary.tsx` — 左侧组件库（HTML5 原生拖拽，`dataTransfer` 传参）
  - `TopToolbar.tsx` — 顶栏（新建/保存/导入/导出/组合/运行）
  - `ConfigPanel.tsx` — 右侧配置面板（节点参数 + 端口 + 变量映射 + 连线配置）
  - `SettingsPanel.tsx` — API Key 设置弹窗（Provider 切换、按需持久化）
  - `SaveHistory.tsx` — 保存历史侧栏（项目 CRUD + 版本恢复）
  - `ChatInterface.tsx` — 底部运行预览（Executor 直调 + 日志展示）
- 工具函数 TypeScript 化：`nodeRegistry.ts`、`flowHelper.ts`、`executor.ts`
- Redux Store：`flowSlice`（画布状态）、`settingsSlice`（设置）、`saveSlice`（项目/保存）
- 保留 Electron 配置（`electron/main.cjs` + `package.json` 中的 build 配置）

**TS 配置要点**:
- `jsx: "react-jsx"`（无需手动 `import React`，但使用 `React.xxx` 仍需）
- `verbatimModuleSyntax: true`（type-only 导入须用 `import type`）
- `noUnusedLocals/noUnusedParameters: true`（未使用变量会报错）

**构建结果**: `npx tsc -b --noEmit` 零错误，`npx vite build` 成功（431KB JS + 9.6KB CSS gzip 后 135KB + 2.3KB）

## 后续计划

- 组合/展开节点功能（groupSelected/ungroupSelected）
- 执行引擎移到后端（参考 Dify DAG）
- 流程执行时节点高亮
- 连线自定义样式（分支/并行线型）
- Community marketplace（远期）

## 桌面版

Electron 桌面版已配置：
- `cd frontend && npm run electron:dev` — 开发模式（Vite + Electron）
- `cd frontend && npm run electron:build` — 打包为安装程序（输出到 frontend/release/）
- Electron 主进程自动启动 Python 后端，等待就绪后打开窗口
- 安装前需确保目标机器有 Python 3.10+（或打包时用 PyInstaller 将后端打成 exe）

## 给 AI 的注意事项

- 所有 API Key 只能存在于后端，前端通过后端代理调用 LLM
- 数据库使用 SQLite + aiosqlite（异步），换 PG 只需改连接字符串
- 前端使用 Redux Toolkit + React Flow，状态通过 `store.dispatch` / `useAppSelector` 访问
- 画布组件 `FlowCanvas` 通过 `forwardRef` 暴露 `newFlow/importFlow/exportFlow/saveFlow/runSimulation/getNodesAndEdges` 方法
- 外部访问 React Flow 实例可使用 `getReactFlowInstance()`（从 FlowCanvas 模块导出）
- 拖拽使用 React Flow 的 `onDrop/onDragOver` + HTML5 Drag API
- 热启动脚本 dev.bat 用 start 命令开新窗口，关闭窗口自动杀进程
- Git Bash 中 curl 传中文 JSON 会编码错误，通过文件传参解决
