---
id: office-decompose
description: 把一句话办公需求拆成可交付物清单再逐项产出
when: 周报、纪要、方案、多份材料；用户一句话但期望多份成品
---

# office-decompose

先拆单，再写件。禁止一上来堆长文却漏交付物。

## 步骤

1. **澄清目标**：受众、格式（md/docx/xlsx）、截止口径；缺关键信息用 `question`。
2. **拆交付物**：列出 2～5 个可验收条目（标题 + 路径建议 + 格式）。
3. **逐项产出**：用 `write_deliverable`（或 office 带工具）写到 `deliverables/`；一项做完再下一项。
4. **清单复核**：`list_deliverables` 确认路径齐全。
5. **收口**：回复里给出交付物路径列表 + 各一件话摘要。

## 与多 Agent

- **厂内动态**：主环可 `task` 并行探索/起草（不替代拓扑导出）。
- **导出编队**：固定多角色流水线用 Bundle `topology.json` + `orchestrate`（见拓扑文档）。

## 反例

- 只有聊天回复、无 deliverables 文件
- 把多个无关主题塞进一个巨型文档却无目录
- 未问清格式就擅自改扩展名
