---
id: browser-inspect
description: 用浏览器工具打开页面、读快照、按链接跳转完成核验
when: 需要看真实页面结构、点链接跟进、或 webfetch 不够用时
---

# browser-inspect

先快照再行动；默认 static 引擎即可完成「打开→读→跟链接」。

## 步骤

1. `browser_open(url)` 打开页面，记下 `session_id` 与 `links[]`。
2. `browser_snapshot` 复核标题与正文要点。
3. 需要跟进时 `browser_click(link_index=N)`（不要臆造选择器）。
4. 复杂表单/真实点击：环境需 playwright；否则保持 static 或改用 webfetch。
5. 结论带来源 URL；敏感操作勿自动提交。

## 反例

- 不看 links 就瞎猜 selector
- 把 static 引擎当成已渲染 SPA 完整 DOM
- 对非 http(s) 地址强行打开
