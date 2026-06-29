# fangyu — AI Flow Canvas

可视化 AI 工作流编排工具，对标 Dify/Coze，支持嵌套子图执行、RAG 知识库、实时监控。

## 项目结构

```
.
├── frontend/               # React 19 + Vite 8 + React Flow v11
│   ├── src/
│   │   ├── components/     # TSX 组件
│   │   │   ├── App.tsx            # 主布局
│   │   │   ├── AtomNode.tsx       # 通用节点渲染（含多端口）
│   │   │   ├── CompositeNode.tsx  # 组合节点
│   │   │   ├── ConfigPanel.tsx    # 右侧配置面板
│   │   │   ├── FlowCanvas.tsx     # 核心画布
│   │   │   ├── NodeLibrary.tsx    # 左侧组件库
│   │   │   ├── BottomPanel.tsx    # 底部标签页容器（可拖拽）
│   │   │   ├── ChatInterface.tsx  # 运行预览（底部标签页）
│   │   │   ├── SettingsPanel.tsx  # API Key 设置
│   │   │   ├── SaveHistory.tsx    # 保存历史
│   │   │   ├── ToolRegistry.tsx   # 工具注册表（底部标签页）
│   │   │   ├── SkillManager.tsx   # 技能库（底部标签页）
│   │   │   ├── KnowledgePanel.tsx # 知识库管理（底部标签页）
│   │   │   ├── MonitorPanel.tsx   # 执行日志查看（底部标签页）
│   │   │   └── SubFlowEditor.tsx  # 子图编辑器（弹窗）
│   │   ├── store/          # Redux Toolkit (flowSlice/settingsSlice/saveSlice)
│   │   ├── utils/          # nodeRegistry.ts / flowHelper.ts / executor.ts
│   │   └── styles/
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts      # 代理 /api → localhost:8000
│
├── backend/                # Python 3.14 + FastAPI + SQLite (aiosqlite)
│   ├── app/
│   │   ├── main.py
│   │   ├── core/config.py
│   │   ├── models/         # database / knowledge / execution_log / setting
│   │   ├── routers/        # flow / llm / settings / knowledge / project / monitor / tools / skills
│   │   └── services/       # executor / llm / memory / embedding / sandbox / tool_registry / skill / variable / search / knowledge
│   ├── data/               # SQLite DB、工具注册表、技能文件
│   └── requirements.txt
│
├── tests/
│   └── test_all_features.py   # 全功能测试（10 项）
├── ROADMAP.md              # 后续规划
├── AGENTS.md
└── dev.bat                 # 一键启动
```

## 开发启动

```bash
# 一键启动
dev.bat

# 分别启动
cd backend && py run.py          # http://localhost:8000（热重载）
cd frontend && npm run dev        # http://localhost:5173（热重载）

# 重启后端（Windows）
taskkill -f -fi "IMAGENAME eq python.exe"
cd backend && py -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## 节点类型（25 种，全部实现）

| 分类 | 节点 | 说明 |
|------|------|------|
| **流程控制** | start / end / trigger / condition / switch / loop / input / output | 含多分支条件、循环体子图 |
| **AI 能力** | llm / code / knowledge / prompt-assembly | LLM、Python 沙箱、RAG |
| **工具集成** | http / json-parse / search / tool-call / register-tool / execute-skill / learn-skill | web/news/academic 搜索、arXiv |
| **数据操作** | variable-set / variable-get / transform / text-process | 变量、字段映射、文本 |
| **记忆存储** | memory-read / memory-write / extract-memory / search-sessions | 持久化记忆 |

### 特殊节点
- **composite** — 组合节点，内部可编辑子图（右键 → "编辑内部节点"）
- **loop** — 循环节点，支持 inner_nodes 子图作为循环体执行

## API 端点

| 端点 | 说明 |
|------|------|
| `POST /api/v1/flow/run` | 执行流程（返回 results + logs） |
| `POST /api/v1/flow/run/stream` | SSO 流式执行 |
| `POST /api/v1/flow/execute-code` | 代码沙箱 |
| `POST /api/v1/llm/chat` | LLM 代理 |
| `POST /api/v1/llm/chat/stream` | SSO 流式 |
| `GET /api/v1/llm/models` | 模型列表 |
| `GET/PUT /api/v1/settings/` | 设置 |
| `GET/POST/PUT/DELETE /api/v1/projects/` | 项目 CRUD |
| `POST/GET/DELETE /api/v1/knowledge/upload\|docs\|docs/{id}` | 文档管理 |
| `POST /api/v1/knowledge/search` | 语义搜索（n-gram + vector） |
| `GET/DELETE /api/v1/monitor/logs` | 执行日志 |
| `GET/POST/DELETE /api/v1/tools/` | 工具注册 |
| `GET/DELETE /api/v1/skills/` | 技能管理 |

## 核心架构

### 执行引擎（executor.py）
- DAG 拓扑排序 → 按深度分批并行执行
- 27 种节点类型全部实现 dispatch
- **composite-node 递归**: `inner_nodes` + `inner_links` 作为子图递归调用 `run_flow`
- **loop 循环体**: 支持 `inner_nodes` 子图每个迭代执行
- **condition 多分支**: `branch_count>2` 时 eval 返回整数索引 → `branch_{idx}`
- **search**: Bing 爬取（web）+ freshness 过滤（news）+ arXiv API（academic）
- **tool-call**: 自动解析 LLM JSON 输出（支持 OpenAI function-calling 格式）
- **RAG**: 上传文档 → 分块 → n-gram 字符相似度 + 可选 sentence-transformers

### 前端节点渲染（AtomNode.tsx）
- 多端口渲染：outputSchema > 1 时渲染独立 Handle 并显示端口名
- 端口 ID 与 edge sourceHandle/targetHandle 匹配

### 监控（MonitorPanel）
- `ExecutionLog` 表持久化每次 flow 的节点级日志
- 面板展示：flow_id 过滤、节点输入/输出/耗时/错误查看

## 关键文件

| 文件 | 作用 |
|------|------|
| `backend/app/services/executor.py` | 核心执行引擎（~920 行） |
| `backend/app/services/tool_registry.py` | 24 个内置工具 + 动态注册 |
| `backend/app/services/embedding.py` | n-gram 语义相似度 |
| `backend/app/services/knowledge.py` | 文档分块 + 编码检测 |
| `frontend/src/components/AtomNode.tsx` | 节点渲染（多端口） |
| `frontend/src/components/SubFlowEditor.tsx` | 子图编辑器弹窗 |
| `frontend/src/components/KnowledgePanel.tsx` | 知识库管理面板 |
| `frontend/src/components/MonitorPanel.tsx` | 日志查看面板 |
| `frontend/src/utils/nodeRegistry.ts` | 25 种节点定义 + schema |
| `tests/test_all_features.py` | 全功能测试（10/10 通过） |
| `ROADMAP.md` | Agent 节点、独立导出等规划 |

## 给 AI 的注意事项

- 所有 API Key 只存在于后端（数据库 settings 表或环境变量）
- DB 迁移：不用 Alembic，直接 Python 脚本 `ALTER TABLE`
- 后端重启用 `taskkill -f -fi "IMAGENAME eq python.exe"` 杀干净
- 调试 curl: 用 Python `urllib.request` 而非 curl.exe（PowerShell 引号问题）
- composite 和 loop 的 `inner_nodes` 格式：`[{id, originType, config, mappings, relativeX, relativeY}]`
- 添加新节点类型需同时更新：后端 registry、前端 NODE_CATEGORIES、`getNodeMeta`、AtomNode 多端口、`NodePicker.tsx` 的兼容规则
- 执行器 `_execute_node` 签名包含 `node_data` 参数（原 `nd` 对象），新节点类型如需要可访问

## 节点连接兼容规则

**画布交互**（Dify 风格 + 拖拽并存）：
- 新建流程默认带一个「开始」节点
- 节点底部输出端口有 "+" 按钮，点击弹出兼容节点菜单
- 选中后自动添加节点并连线
- 也可从左侧组件库拖拽节点到画布任意位置（不自动连线）

**兼容规则**（定义在 AtomNode.tsx → NodePicker.tsx）：
```
不可作为目标（无输入端口，不会出现在 + 菜单）：
  - 开始 (start) / 输入 (input) / 读取变量 (variable-get)

不可作为源（无输出端口，没有 + 按钮）：
  - 结束 (end) / 输出 (output)

特殊规则：
  - 开始 → + 菜单只显示「输入」（开始只输出 trigger 信号，连其他节点无意义）
  - 其余所有节点 → + 菜单显示所有有输入端口的节点
```

## AI 工作流规则（严格执行）

接到任何需求后，按以下顺序执行：

1. **读源码** — 先理解现有代码结构、数据流、已有约定，不跳过不臆测
2. **思考架构** — 分析改动波及的范围，画清楚改动前后的数据流变化
3. **检查接口兼容** — 新增/改动的 API 必须向后兼容；前端 Redux store 结构变更需同步更新所有 selector；后端路由/模型变更需检查所有调用方
4. **动手写代码** — 遵守现有代码风格，不加注释，不引入新依赖
5. **写测试代码** — 每次新增功能必须有配套测试（后端 `tests/` 目录，前端如有测试框架也补充）
6. **提交 git** — `git add -A` → `git commit -m`，提交信息写明改动内容和原因
7. **更新文档** — `AGENTS.md`（文件列表、API、架构说明）、`ROADMAP.md`（功能进度），如有需要

> 这条规则本身也适用于你对 AGENTS.md 本身的修改——你现在正在执行第 6 步。

## 后续规划（详见 ROADMAP.md）

1. Agent 节点（LLM + tool-call + memory 闭环）
2. 独立可执行导出（flow → 单文件 .py）
3. 真·循环体执行（可视化选择体节点）
4. 画布性能优化（虚拟化、增量保存）
