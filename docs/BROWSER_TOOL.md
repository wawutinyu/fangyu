# 浏览器 / Computer-use 原料

默认 **static** 引擎（httpx + HTML 快照），不强制装浏览器驱动。

| 工具 | 引擎 | 作用 |
|------|------|------|
| `browser_open` | 双 | 打开 URL；`engine=static\|playwright` 可强制 |
| `browser_snapshot` | 双 | 当前页快照（pw 会重读 DOM） |
| `browser_click` | 双 | `link_index` 跟链接；pw 可用 `selector` |
| `browser_type` | pw | 向选择器填文本 |
| `browser_wait` | pw | 等选择器 / 纯超时 |
| `browser_scroll` | pw | 滚动或 `scroll_into_view` |
| `browser_press` | pw | 键盘按键（Enter / Escape…） |
| `browser_screenshot` | pw | 截图 → `.fangyu/screenshots/` |

可选升级：

```bash
pip install 'fangyu[browser]'
playwright install chromium
```

技能：`browser-inspect`（`skill_load`）。

与 `webfetch` 区别：browser 保留会话与链接索引，适合多步跟页；webfetch 是单次拉正文。
