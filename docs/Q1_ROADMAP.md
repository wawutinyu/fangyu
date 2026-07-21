# Q1 可观测（裁剪版）

> 对照日期：2026-07-21  
> 前置：Q0 完成。默认 warn / fail-open。

## 范围

| ID | 项 | 状态 | 说明 |
|----|----|------|------|
| Q1-1 | `trace_id` 贯通 flow | **DONE** | `core/tracer.new_trace_id`；结果带 `trace_id` |
| Q1-2 | 结构化事件表 | **DONE** | `models/trace_log.py` → `execution_traces` |
| Q1-3 | scheduler 打点 | **DONE** | start/end/error/flow_*；payload 截断 + 脱敏 |
| Q1-4 | 查询 API | **DONE** | `GET /api/v1/monitor/traces/{trace_id}` |
| Q1-5 | 宪法质量 warn | **DONE** | `quality.max_consecutive_errors`（默认 5） |

## 开关

```bash
FANGYU_TRACE_MODE=on    # off 关闭打点
```

## 明确不做

Prometheus / OpenTelemetry / 实时 UI 时间线 / 配额表（Q2+）。
