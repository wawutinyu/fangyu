# 浏览器 / Computer-use 原料

默认 **static** 引擎（httpx + HTML 快照），不强制装浏览器驱动。

| 工具 | 作用 |
|------|------|
| `browser_open` | 打开 URL，返回 title/text/links |
| `browser_snapshot` | 当前页快照 |
| `browser_click` | `link_index` 跟随链接（static）；或 playwright `selector` |
| `browser_type` | 仅 playwright |

可选升级：

```bash
pip install playwright
playwright install chromium
```

技能：`browser-inspect`（`skill_load`）。

与 `webfetch` 区别：browser 保留会话与链接索引，适合多步跟页；webfetch 是单次拉正文。
