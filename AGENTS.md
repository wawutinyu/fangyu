# fangyu — AI Flow Canvas

可视化 AI 工作流编排工具，对标 Dify/Coze，支持嵌套子图执行、RAG 知识库、实时监控。

## 项目结构

```
.
├── fangyu/                 # ★ 独立可分发包（纯功能代码，零测试）
│   ├── __init__.py         # 包入口
│   ├── __main__.py         # CLI: python -m fangyu
│   ├── pyproject.toml      # pip install fangyu/
│   ├── a2a/                # 共享协议契约（前后端唯一交集）
│   │   ├── protocol.py     # Task, Message, AgentCard — A2A v1.0 数据模型
│   │   ├── bus.py, registry.py, transport_http.py
│   │   └── trust/          # ATP 子协议（Ed25519 签名/验签/防重放）
│   ├── engine/             # 后端引擎（依赖 a2a/ 协议）
│   │   ├── scheduler.py    # DAG 拓扑排序执行器
│   │   ├── executor.py     # 执行器注册与调度
│   │   ├── sandbox.py      # 沙箱 Python 执行
│   │   ├── llm.py          # LLM API 客户端
│   │   ├── memory/         # 持久化记忆
│   │   ├── knowledge.py    # 知识库检索
│   │   ├── embedding.py    # 向量嵌入（SentenceTransformer）
│   │   ├── a2a_runtime.py  # AgentBus + AgentRegistry 运行时
│   │   ├── trust_runtime.py# ATP 信任运行时
│   │   └── ...             # 20+ 执行器模块
│   └── frontend/           # 前端 TypeScript 工具（依赖 a2a/ 协议）
│       ├── codeGenerator.ts  # Python 代码生成（输出 from fangyu.a2a）
│       ├── nodeRegistry.ts   # 节点注册表（20 种合并类型）
│       └── ...               # flowHelper, exportFlow, a2aProtocol 等
│
├── backend/                # FastAPI 接入层（依赖 fangyu.engine）
│   ├── app/
│   │   ├── main.py         # 导入 from fangyu.engine.xxx
│   │   ├── routers/        # API 路由（导入 from fangyu.engine.xxx）
│   │   └── models/
│   └── data/
│
├── frontend/               # React UI 层（依赖 fangyu/frontend/）
│   ├── src/
│   │   ├── components/     # TSX 组件
│   │   ├── store/          # Redux Toolkit（含 73 个单元测试）
│   │   └── ...
│   └── ...
│
├── tests/                  # 所有测试（fangyu/ 外面）
│   ├── unit/               # 单元测试
│   ├── integration/        # 集成测试
│   └── e2e/                # Playwright e2e（34 个）
│
├── AGENTS.md
└── dev.bat
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

### 执行引擎（6 文件分层架构）

```
services/
├── __init__.py      # 公共 API (run_flow, NodeContext...)
├── context.py       # NodeContext dataclass
├── utils.py         # _smart_template, _resolve_path
├── registry.py      # NODE_REGISTRY, _EXECUTORS, register_executor, register_executors
├── scheduler.py     # run_flow, topo sort, _run_single_node, _exec_unknown
├── executor.py      # 门面 (facade) — pure re-export + register_executors()
├── exec_core.py     # 10 个流程控制 handler
├── exec_ai.py       # 5 个 AI handler
├── exec_data.py     # 5 个数据操作 handler
├── exec_memory.py   # 4 个记忆存储 handler
└── exec_tools.py    # 5 个工具集成 handler
```

- DAG 拓扑排序 → 按深度分批并行执行（`scheduler.py`）
- 28 种节点类型，注册模式：`register()` → `register_executor("type", fn)`（`registry.py`）
- Handler 统一签名：`async def handler(ctx: NodeContext) -> dict[str, Any]`
- **composite/loop 递归**: 调用 `scheduler.run_flow()` 执行子图（`exec_core.py`）
- **condition 多分支**: `branch_count>2` 时 eval 返回整数索引 → `branch_{idx}`
- **search**: Bing 爬取（web）+ freshness 过滤（news）+ arXiv API（academic）
- **tool-call**: 自动解析 LLM JSON 输出（支持 OpenAI function-calling 格式）
- **RAG**: 上传文档 → 分块 → n-gram 字符相似度 + 可选 sentence-transformers
- **错误隔离**: 异常 → `{error: msg}`，非 dict 返回值兜底
- **监控**: 每个节点结果含 `elapsed_ms` 执行耗时
- **递归防护**: `_flow_depth` 上限 10 层

### 前端节点渲染（AtomNode.tsx）
- 多端口渲染：outputSchema > 1 时渲染独立 Handle 并显示端口名
- 端口 ID 与 edge sourceHandle/targetHandle 匹配

### 监控（MonitorPanel）
- `ExecutionLog` 表持久化每次 flow 的节点级日志
- 面板展示：flow_id 过滤、节点输入/输出/耗时/错误查看

## 关键文件

| 文件 | 作用 |
|------|------|
| `backend/app/services/scheduler.py` | 调度引擎（run_flow、topo 排序、分批次执行） |
| `backend/app/services/registry.py` | 执行器注册中心（_EXECUTORS、NODE_REGISTRY、register_executor） |
| `backend/app/services/context.py` | NodeContext dataclass（handler 统一入参） |
| `backend/app/services/utils.py` | 工具函数（_smart_template、_resolve_path） |
| `backend/app/services/executor.py` | 门面（re-export + 启动 register_executors） |
| `backend/app/services/exec_core.py` | 流程控制 handler（start/end/condition/switch/loop/composite/approval/trigger/input/output） |
| `backend/app/services/exec_ai.py` | AI handler（llm/code/knowledge/search/prompt-assembly） |
| `backend/app/services/exec_data.py` | 数据 handler（json-parse/variable-set/variable-get/transform/text-process） |
| `backend/app/services/exec_memory.py` | 记忆 handler（memory-read/memory-write/extract-memory/search-sessions） |
| `backend/app/services/exec_tools.py` | 工具 handler（http/tool-call/register-tool/execute-skill/learn-skill） |
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
- 添加新节点类型需同时更新：后端 `registry.py`（元数据）、`exec_*.py`（register() 注册 handler）、前端 NODE_CATEGORIES、`getNodeMeta`、AtomNode 多端口、`NodePicker.tsx` 的兼容规则
- Handler 统一签名：`async def handler(ctx: NodeContext) -> dict[str, Any]`，通过 `ctx.config` 访问配置，`ctx.inputs` 访问输入，`ctx.node_data` 访问原始节点数据
- 注册新 handler：在对应 `exec_*.py` 中定义函数，添加到该文件底部的 `register()` 函数中
- 依赖图单向：context → utils → registry → scheduler → exec_* → executor (facade)

## Dify 设计模式（参考实现）

### "+" 按钮弹出菜单（block-selector）
- **触发方式**：Dify 将 "+" 集成在 Handle 组件中，节点 hover/选中时可见（opacity-0 → group-hover:opacity-100）
- **定位**：使用 floating-ui Popover，`placement="right-start"`，弹出菜单位于按钮右侧，自动处理视角边缘
- **无遮罩**：浮层面板，无半透明背景，ESC / 外部点击关闭
- **搜索**：每个 tab 下有搜索框（Input/SearchBox），debounce 500ms
- **Tab 切换**：Blocks / Sources / Tools / Start / Snippets 五个 tab，每个 tab 下筛选不同数据源
- **选中后行为**：创建 `candidateNode` 预览状态（非直接添加），用户确认后正式插入

### 节点 Handle 设计（node-handle.tsx）
```tsx
// Dify 的 Handle 直接内嵌 BlockSelector 作为 trigger 的子元素
<Handle type="source" position={Position.Right}>
  {isConnectable && !getNodesReadOnly() && (
    <BlockSelector
      open={open}
      onOpenChange={handleOpenChange}
      onSelect={handleSelect}
      placement="right"
      triggerClassName={open => `
        absolute top-0 left-0 opacity-0 pointer-events-none
        group-hover:opacity-100
        ${data.selected && 'opacity-100'}
        ${open && 'opacity-100'}
      `}
      availableBlocksTypes={availableNextBlocks}
    />
  )}
</Handle>
```
关键设计：
- Handle 同时是连接端口和 "+" 按钮的容器
- 触发区域默认透明（`opacity-0`），节点 hover 或选中时显示
- 点击 Handle 本身打开 popover（不需要单独的 "+" 图标）
- 我们的实现（AtomNode.tsx + NodePicker.tsx）简化版：底部 "+" 按钮 + `position:fixed` 浮层

### 可用块兼容性（use-available-blocks.ts）
- `availableNextBlocks`（源端口 → 后面可添加的块）：`StartPlaceholder`/`LoopEnd`/`KnowledgeBase` 返回空数组，其余返回全部
- `availablePrevBlocks`（目标端口 → 前面可添加的块）：`Start`/`StartPlaceholder`/`DataSource`/Triggers 返回空数组，其余返回全部
- 容器内（Iteration/Loop）：额外排除 `Iteration`/`Loop`/`End`/`DataSource`/`KnowledgeBase`/`HumanInput`
- 我们的 `getValidTargets` 实现更简单：`NO_INPUT` 集 + 按 sourceType 过滤

## Add Button + Mode Toggle（2025-06-30 修复记录）

### 问题
- `+` 按钮与 Handle 共享 DOM 区域，事件竞争导致点击无反应或选中节点
- 之前的修复尝试（覆盖层、native stopPropagation）均因 React Flow 事件系统拦截而失败

### 最终方案：Dify 式独立 `+` 按钮

**结构**：
```
AtomNode root div
├── 顶部色条
├── 节点内容
├── 输入端口 (Handle type="target")
├── 输出端口 (Handle type="source")
└── + 按钮 ← 独立 div，渲染在 root div 最底部，与 Handle 零重叠
```

**仅在 `portMode === 'add'` 渲染 `+` 按钮**：
- 条件：`outPorts.length > 0`（有输出端口的节点才显示）
- 默认 `opacity: 0; pointer-events: none`
- 父节点 hover → `opacity: 1; pointer-events: auto`
- 点击 → `e.stopPropagation()` + `openPicker()` → NodePicker

**连线模式**：Handle 正常工作，`+` 不渲染

### 节点兼容过滤（NodePicker.tsx）
- 接收 `compatibleTypes: string[]` 替代粗糙的 `getValidTargets`
- 规则：
  1. 排除自身
  2. 目标节点 inputSchema required 端口未满（已有入边数 < required 端口数）
  3. 端口类型匹配：当前 outputSchema type ∈ 目标 inputSchema type（any 通配）
  4. 排除 start
- 此逻辑复用 FlowCanvas.tsx 的 `isValidConnection`

### 关键文件
- `AtomNode.tsx` — SourceHandle 简化（不加覆盖层），底部加独立 `+` 按钮
- `NodePicker.tsx` — 改为接收 `compatibleTypes` 过滤
- `flowSlice.ts` — portMode state（已有）
- `TopToolbar.tsx` — 切换按钮（已有）
- `utils/nodeRegistry.ts` — 新增 `getCompatibleTargets(sourceType, allNodes, edges)` 工具函数

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

## 最新变更（2025-07-10）

### 执行器架构重构（commit 4d35e89）
- 拆分 executor.py → 6 文件：executor.py(facade) + scheduler.py + registry.py + context.py + utils.py + 5 个 exec_*.py handler 模块
- 28 handler 统一签名 `async def handler(ctx: NodeContext) -> dict[str, Any]`
- 注册模式：`register()` → `register_executor("type", fn)`（无 import 副作用）
- 错误隔离：异常 → `{error: msg}`，非 dict 返回值兜底
- 监控：每个节点结果含 `elapsed_ms`
- 递归防护：`_flow_depth` 上限 10 层
- 循环引用修复：handler 模块直接 import `.scheduler`
- 文档更新：AGENTS.md 关键文件列表、注意事项

### 小修复（commit ac28df7）
- approval 节点：`raise ValueError("APPROVAL_PENDING:...")` → `return {"_pending": True, ...}` 字典返回值
- 子图映射加固：`convertFromExportFormat` 归一化 inner_nodes 格式（兼容扁平/ReactFlow 嵌套）
- 7 个导出存根：switch/loop/trigger/prompt-assembly/text-process/extract-memory/search-sessions 替换 default 中的"尚未实现"

### 已知问题（未修复）
- headless Chromium fetch 挂起（`/api/v1/llm/chat`），AbortController + setTimeout 无法可靠中止
- `SentenceTransformer` 同步 encode() 阻塞异步事件循环
- 4 个 pre-existing 测试失败（localExecutor.test.ts: fetch spy matcher + knowledge context passthrough）

## 后续规划（详见 ROADMAP.md）

1. Agent 节点（LLM + tool-call + memory 闭环）
2. 独立可执行导出（flow → 单文件 .py）
3. 真·循环体执行（可视化选择体节点）
4. 画布性能优化（虚拟化、增量保存）
