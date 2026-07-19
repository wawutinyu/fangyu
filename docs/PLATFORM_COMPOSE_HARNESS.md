# 平台能力验收：拖节点拼出 Harness 级智能体

> **验的是平台，不是交成品。**  
> 整环执行器（`agent-loop`）可保留作捷径；过关标准是：**不用它，也能用可拖拽原语拼出同级能力。**

关联：[毕业标准](GRADUATION_EXPORTABLE_AGENT.md)

---

## 验收命题

在 Flow 画布上，仅用节点库里的原语（尤其 **循环 `until_done`** + **工具轮 `tool-round`**，可加记忆/分支/MCP），拼出一条流程，使 Agent 能：

1. 多轮：模型 → 工具 → 结果回灌 → 再决策  
2. 在绑定 workspace 内读/写文件（coding 工具带）  
3. 可选先 `plan` 再执行  
4. 导出/预览可跑，且流程图里 **没有** `agent-loop` 节点  

满足则记：**平台具备拼装 harness 级智能体的能力**。

---

## 怎么拼（最小图）

```text
任务(input) → 循环(mode=until_done, max_turns≥8)
                 └ 内嵌：工具轮(tool-round, toolbelt=coding)
            → 输出
```

- 循环无内嵌时：默认每轮跑一轮 `tool-round`（仍可打开子图画自己的轮次）  
- 协议与整环相同：`plan` / `tool` / `done` JSON  

Studio：**创建 → 节点编排 · Harness** 会加载骨架；请改成上述原语或从节点库自拼。

---

## 自动化钉

```bash
pytest tests/unit/test_compose_harness.py -q
```

断言：`loop(until_done)` + `tool-round` 路径写出 workspace 文件，且节点类型不含 `agent-loop`。

---

## 与整环的关系

| | 整环 `agent-loop` | 可拼原语 |
|--|-------------------|----------|
| 用途 | 高级捷径 | **平台能力验收正途** |
| 画布 | 一个节点 | 循环 + 工具轮（+ 记忆等） |
| 是否保留 | ✅ 保留 | ✅ 必须能独立过关 |

*版本 2026-07-19*
