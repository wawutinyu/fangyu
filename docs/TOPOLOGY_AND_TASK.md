# 拓扑编排与 task 委派

方隅里有两套「多 Agent」能力，用途不同，不要混成一条产线。

## 1. 对照

| | **task（厂内动态）** | **topology / orchestrate（导出编队）** |
|--|--|--|
| 何时 | 主 Agent 运行时按需委派 | Bundle 已声明的固定编队 |
| 生命周期 | 随 agent-loop；默认可嵌套深度 1 | 脱离 Studio，读 `config/topology.json` |
| 并行 | `tasks:[{...},...]` 或 `background` | `pipeline` 中的并行段 / `stages` |
| 角色 | explore / general / review / scout | topology.agents + toolbelt |
| 导出 | 不单独导出子会话 | 打进 Bundle，可 `orchestrate` / IM |

**原则：** 探索、临时候审、临时并行调研 → `task`；产品化多专家流水线 → `topology`。

## 2. topology.json 形态

### 串行（兼容旧包）

```json
{
  "version": "1.0",
  "pipeline": ["researcher", "writer", "reviewer"],
  "agents": [ ... ],
  "pass_mode": "append"
}
```

按数组顺序链式跑；`pass_mode=append` 时后步带上原任务与上步结果。

### 并行段（pipeline 内嵌）

```json
{
  "pipeline": [
    "scout",
    { "parallel": ["writer", "analyst"] },
    "publisher"
  ],
  "agents": [ ... ],
  "pass_mode": "append"
}
```

同一 `parallel` 数组内共享同一输入、并发跑完后再进入下一步；并行结果合并为带角色标签的文本再传给下游。

### stages（等价写法）

```json
{
  "stages": [
    ["scout"],
    ["writer", "analyst"],
    ["publisher"]
  ],
  "agents": [ ... ]
}
```

若同时存在 `stages` 与 `pipeline`，**优先 `stages`**。

### edges（声明用）

`edges` 可描述画布依赖（含 `parallel` / `depends` 标签），供 Studio 与导出对齐；**运行时以 `stages` / `pipeline` 为准**。依赖边（A 必须先于 B）请落成 stages 顺序，而不是只画边不改 pipeline。

## 3. task 并行速查

```json
{"action":"tool","name":"task","args":{
  "tasks": [
    {"subagent_type":"explore","prompt":"找认证入口"},
    {"subagent_type":"scout","prompt":"查 OAuth 最佳实践"}
  ]
}}
```

- 前台并行：一次返回 `results[]`
- `background: true`：完成后回灌父环（勿轮询）
- plan 模式禁止 `general`（防写盘）

## 4. 观测

顶层与子会话都会写入 `workspace/.fangyu/harness_trace.jsonl`：

- `kind=agent_loop`：含 `task_depth`
- `kind=task_child`：含 `task_id` / `subagent_type`
- `kind=task_parallel`：一批并行委派的摘要

Studio **更多 → 原料 → Trace** 可浏览。
