---
id: multi-agent-split
description: 把复杂意图拆成多专家角色，并落到可导出拓扑
when: 需要多 Agent 协作、编队导出、或「谁搜谁写谁审」分工不清时
---

# multi-agent-split

意图 → 角色清单 → 依赖边 → Bundle 拓扑。不要只在聊天里口头分工。

## 步骤

1. **一句话意图**：保留用户原话作 `intent`（勿过度改写）。
2. **选模板**（或等价手工角色）：
   - 检索→分析→汇总：`search_analyze_summarize`
   - 观察→执行：`worker_pair`
   - 最小双人：`simple_dual`
3. **写清依赖**：谁必须等谁（`type: depends`）；可并行的不要串成一条。
4. **落盘**：导出 `config/topology.json`（`pipeline` / `stages` / `edges`），用 `orchestrate` 跑，而不是只在 Studio 拖一下。
5. **厂内临时并行**：一次性探索/外研用 `task` + `tasks[]`；**产品化编队**用拓扑（见 TOPOLOGY_AND_TASK）。

## 依赖边约定

- `A --depends--> B`：B 依赖 A（A 先跑）
- 多人依赖同一上游且互不依赖：同一波并行
- 运行时：有 agent 间 depends 边时，按边排波次；显式 `stages` 优先

## 反例

- 拆了角色却无 topology / 无法脱离 Studio 跑
- 本可并行的写手与分析师被强制串行
- 用 task 子会话冒充已毕业的多 Agent 导出态
