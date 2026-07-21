# 失败模式目录（Q0）

> 统一「外部调用失败时应该怎样」的对策表。实现分散在各层；本表是契约，不是一次性改完所有调用点。

| 失败模式 | 当前 / Q0 行为 | 目标行为 |
|---------|----------------|----------|
| LLM 返回空 | 原样返回空字符串 | 重试 2 次 → 降级默认回复 |
| LLM 格式错误 | validator **warn**（不阻断） | 带错误回传重试 → deny 可开 |
| LLM 超时 | 依赖 httpx/提供商超时 | 缩短超时 → 重试 → 降级 |
| 疑似 prompt 注入 | guardrail **warn**（标记） | `block` 模式可拒 |
| 输出含 API Key 形态 | guardrail **脱敏 / warn** | `block` 可拒 |
| 工具异常 | `success:false` + error | 重试 → 降级 → 通知 |
| 工具超时 | 各工具自带 timeout | 统一 per-tool 上限 |
| HTTP 失败 | 抛 ValueError | 重试 → 降级 |
| shell 元字符 / 危险命令 | PermissionError（S0） | 保持拒绝 |
| 导出 compile DoS | 默认禁用 + 限流（S0） | 保持 |
| 未鉴权 API | 401（S0） | 保持 |
| 速率限制 | 多数直接报错 | 指数退避（Q1+） |
| 内存 / 流量峰值 | 无配额 | 限流（冻住） |

## 开关速查

```bash
FANGYU_SCOPE_MODE=compat          # off=旧 flat（仍挡 Key）
FANGYU_GUARDRAIL_MODE=warn        # block | off
FANGYU_VALIDATOR_MODE=warn        # deny | off
```

生产建议保持 **warn**，观察告警字段 `guardrail_warnings` / `validator_warnings` 后再收紧。
