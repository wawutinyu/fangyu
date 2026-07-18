# 办公 × 编排（P4）

> 一句办公任务 → multi 拓扑（起草/审校/落盘）→ `orchestrate` / IM 整网触发 → deliverables。

关联：[毕业标准](GRADUATION_EXPORTABLE_AGENT.md) · [拓扑与 task](TOPOLOGY_AND_TASK.md) · [IM 飞书](IM_FEISHU.md)

## 证明链

```bash
# 导出办公编队（自动选 office_report 模板）
python -m fangyu bundle create --profile multi \
  --intent "协作写本周产品周报并落盘" --out ./office-net

# 本机编排
python -m fangyu bundle orchestrate ./office-net -m "写周报"

# 或 IM 入站（需 topology.json）
python -m fangyu bundle im-inbound ./office-net -m "写周报" --mode orchestrate
```

无 Key 单测：`tests/unit/test_g2_workbuddy_multi.py::test_im_orchestrate_office_multi_mock`

## 模板

| template | pipeline | 何时 |
|----------|----------|------|
| `office_report` | draft → review → publish | 周报/纪要/落盘/docx… |
| 其它 | 见 intent 模板 | 搜索分析 / 工人 / 双 Agent |

## IM 注意

`mode=orchestrate` **必须** Bundle 含 `config/topology.json`（用 `profile=multi`）。  
workbuddy 单 Agent 包会返回明确错误，不再静默回 chat（除非 `allow_orchestrate_fallback=True`）。

*版本：2026-07-19 · P4*
