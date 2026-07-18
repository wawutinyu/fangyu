# 飞书 IM 凭证配置向导

> 真机事件订阅仍**暂缓**。本页覆盖：把 App 凭证写入 Bundle、检查清单、平台回调 URL。

## 运维 · Studio

打开 **运维 → 飞书**：

1. 填 Bundle 目录（导出包或托管实例的根路径）
2. 填 App ID / App Secret / Verification Token（可选 mode=chat|orchestrate）
3. **写入并设为默认** → 生成 `config/im.json`，并设平台默认 Bundle
4. 对照检查清单：challenge 就绪 / 主动回消息就绪

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/v1/im/status?bundle_dir=` | 掩码状态 + steps 检查清单 |
| `POST` | `/api/v1/im/feishu/bind` | 写入 im.json 并设默认 Bundle |
| `POST` | `/api/v1/im/feishu` | 事件订阅回调（challenge + 入站） |
| `POST` | `/api/v1/im/default-bundle` | 仅设默认 Bundle |

CLI 等价：`python -m fangyu bundle im-bind --dir <bundle> ...`

## 环境变量回退

`FEISHU_APP_ID` / `FEISHU_APP_SECRET` / `FEISHU_VERIFICATION_TOKEN` 可覆盖或补充 `im.json`。

无 App 凭证时仍可做 URL challenge 与入站解析；回复写入 Bundle `data/im_outbox.jsonl`。

## 真机（暂缓）

飞书开放平台 → 事件订阅 → 请求地址填平台可达的  
`https://<host>/api/v1/im/feishu?bundle_dir=<绝对路径>`  
或 Bundle serve 的 `/im/feishu`。配好凭证后再开真机联调。
