# 本机毕业：可导出的 OpenCode / WorkBuddy 级 Agent

> 方隅的目的是 **批量、快速产出高质量 Agent 的平台**。  
> 本机毕业 ≠ Studio 好用，而是：**用平台搭出并能导出**达到 OpenCode harness / WorkBuddy 档的独立智能体。

关联：[愿景](VISION_AND_PRODUCT.md) · [评估](PROJECT_ASSESSMENT.md) · [L1 路线图](L1_ROADMAP.md)

---

## 毕业标准（硬）

一条命令或一次导出后，在**不启动 Studio** 的情况下：

1. `python -m fangyu --run-bundle <dir>`（或等价）常驻起来  
2. 经 Chat 或 A2A RPC 下达任务  
3. Agent **多轮**使用工具（读/搜/改/shell 等）完成真实工作  
4. 产物落在声明工作区；危险操作受 **包内宪法** 约束（非宿主全局 `data/`）  
5. 同一 **profile** 可参数化批量出包（工厂），且有集成测锁住行为  

**第一条验收竖切：OpenCode harness 剖面**（仓库工作区 + tool-loop）。  
WorkBuddy 剖面共用同一地基，后补办公技能包。

---

## 地基支柱（P0）

| ID | 支柱 | 验收一句话 |
|----|------|------------|
| P0-1 | Bundle 运行时 `DATA_DIR` 闭环 | 清宿主 `data/` 后同包行为不变；宪法从包内加载 |
| P0-2 | 导出闭包（tools/skills） | 无 Studio 也能执行声明技能 |
| P0-3 | 真 Agentic Loop | 单测：≥2 轮 tool 回灌后结束 |
| P0-4 | Coding 手脚进包 | 对指定 repo 完成读→改→跑最小任务 |
| P0-5 | 工厂 CLI/API | `profile → bundle` 无点画布；OpenCode 集成测绿 |

P0 未完成前：场景模板、观/空画布 polish、未验证 seed Agent **不计入毕业进度**。

---

## 已知空洞（勿当已完成）

- 固定 action loop ≠ agentic loop  
- Bundle 根目录 `constitution.json` 曾只是快照，执行曾读宿主 `DATA_DIR`（P0-1 要修）  
- Skills / MCP / tool_registry 默认不进包  
- Worker 是平台远端肢体，不是导出 Agent  
- Seed「OpenCode」等未经验证 export→真行为  

---

## 进度

| 项 | 状态 |
|----|------|
| 文档对齐毕业线 | ✅ |
| P0-1 Bundle DATA_DIR | ✅ |
| P0-3 Agentic Loop 原语 | ✅（引擎 + 单测；尚未绑进默认导出 skill） |
| P0-4 Coding 手脚进包 | ✅（workspace 工具表；待与 loop 导出技能合体） |
| P0-2 导出闭包 | 待办 |
| P0-5 工厂 + OpenCode 集成测 | 待办 |

*版本：2026-07-18*
