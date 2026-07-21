# Q0 质量地基（裁剪版）

> 对照日期：2026-07-21  
> 原则：warn 默认、feature flag 可回滚；不做完整 14 层。  
> 前置：S0 安全止血已完成。

## 范围

| ID | 项 | 状态 | 开关 |
|----|----|------|------|
| Q0-1 | 三层 scope + API Key exclusion | **DONE** | `FANGYU_SCOPE_MODE=compat\|strict\|off` |
| Q0-2 | Guardrails 输入/输出（warn） | **DONE** | `FANGYU_GUARDRAIL_MODE=warn\|block\|off` |
| Q0-3 | LLM 输出校验（warn） | **DONE** | `FANGYU_VALIDATOR_MODE=warn\|deny\|off` |
| Q0-4 | 失败模式目录（文档） | **DONE** | [FAILURE_MODES.md](FAILURE_MODES.md) |

## 模块

- `core/scope_resolver.py` ← `_smart_template` 委托
- `core/guardrails.py` ← `engine/exec_ai.py` LLM 前后
- `core/llm_validator.py` ← `engine/exec_tools.py` register_tool

## 明确不做（冻住）

Eval / A/B / 配额 / Bundle 签名强制 / OpenTelemetry / 记忆去重全量。

下一步 **Q1**：结构化 trace（ExecutionLog 字段扩展）+ 必要宪法策略。
