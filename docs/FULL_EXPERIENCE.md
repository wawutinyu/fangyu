# 体验全部功能

一键装入「序·律·行·观」演示包，适合第一次摸方隅。

## 怎么开

1. 启动：`./dev.sh` → 打开 http://127.0.0.1:5173  
2. 点工具栏黑色按钮 **「体验全部」**（或 创建 → 体验全部功能）  
3. 按弹窗五步逛：预览 → Agent → 律 → 行 → 观  

可选：创建 → 示例用例 → **全功能画布游**（离线预览，不调 LLM）。

方隅·行：`./install-worker.sh` 后双击 `Fangyu-Worker.command`，再点「派发至行」。

## 包里有什么

| 门 | 内容 |
|----|------|
| **序** | 行动闭环 Flow（observe→plan→act→verify）+ 检索/分析/汇总 Agent 网 |
| **律** | LLM model / SSRF / 循环上限 / 工具名 策略写入本机宪法 |
| **行** | Worker Bundle（含 MQTT 主题 `fangyu/demo/+/trigger`） |
| **观** | 派发或 A2A 后看宅子共场；也可用顶栏旁 **演示剧本** 一键灌数 |

场景 id：`full_experience`（`POST /api/v1/scenario/instantiate`）。
