"""Q0：LLM 输出校验（默认 warn，不阻断）。

FANGYU_VALIDATOR_MODE=warn|deny|off
"""
from __future__ import annotations

import json
import os
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Callable


@dataclass
class ValidationResult:
    passed: bool
    parsed: Any | None = None
    error: str | None = None
    retry_prompt: str | None = None
    warned: bool = False


class OutputValidator(ABC):
    @abstractmethod
    def validate(self, raw_output: str) -> ValidationResult:
        ...


def _extract_json_blob(raw: str) -> str | None:
    text = (raw or "").strip()
    if not text:
        return None
    m = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL | re.I)
    if m:
        text = m.group(1).strip()
    if text.startswith("{") or text.startswith("["):
        return text
    # 尝试截取首个 JSON 对象
    m2 = re.search(r"(\{.*\}|\[.*\])", text, re.DOTALL)
    return m2.group(1) if m2 else None


class JSONValidator(OutputValidator):
    def __init__(self, schema: type | None = None):
        self.schema = schema

    def validate(self, raw_output: str) -> ValidationResult:
        blob = _extract_json_blob(raw_output)
        if not blob:
            return ValidationResult(
                passed=False,
                error="输出不是合法 JSON",
                retry_prompt="请只返回合法 JSON，不要其它说明文字。",
            )
        try:
            parsed = json.loads(blob)
        except json.JSONDecodeError as e:
            return ValidationResult(
                passed=False,
                error=f"JSON 解析失败: {e}",
                retry_prompt=f"上次输出不是合法 JSON（{e}）。请只返回修正后的 JSON。",
            )
        if self.schema is not None:
            try:
                if hasattr(self.schema, "model_validate"):
                    parsed = self.schema.model_validate(parsed)
                elif hasattr(self.schema, "parse_obj"):
                    parsed = self.schema.parse_obj(parsed)
            except Exception as e:
                return ValidationResult(
                    passed=False,
                    error=f"schema 校验失败: {e}",
                    retry_prompt=f"JSON 不符合 schema：{e}。请修正后只返回 JSON。",
                )
        return ValidationResult(passed=True, parsed=parsed)


class MarkdownCodeBlockValidator(JSONValidator):
    def __init__(self, schema: type | None = None, language: str | None = "json"):
        super().__init__(schema=schema)
        self.language = language


def validator_mode() -> str:
    raw = (os.getenv("FANGYU_VALIDATOR_MODE") or "warn").strip().lower()
    if raw in ("off", "0", "false"):
        return "off"
    if raw in ("deny", "block", "enforce"):
        return "deny"
    return "warn"


def validate_with_retry(
    llm_response: str,
    validator: OutputValidator,
    max_retries: int = 0,
    llm_call: Callable[[str], str] | None = None,
) -> ValidationResult:
    """校验；可选重试。Q0 默认 max_retries=0（只记 warn）。"""
    mode = validator_mode()
    if mode == "off":
        return ValidationResult(passed=True, parsed=llm_response)

    current = llm_response
    last = validator.validate(current)
    if last.passed:
        return last

    retries = max(0, int(max_retries))
    for _ in range(retries):
        if not llm_call or not last.retry_prompt:
            break
        try:
            current = llm_call(last.retry_prompt)
        except Exception as e:
            last = ValidationResult(passed=False, error=f"retry failed: {e}", retry_prompt=last.retry_prompt)
            break
        last = validator.validate(current)
        if last.passed:
            return last

    if mode == "warn":
        return ValidationResult(
            passed=True,
            parsed=llm_response,
            error=last.error,
            retry_prompt=last.retry_prompt,
            warned=True,
        )
    return last


def fallback_on_failure(
    result: ValidationResult,
    default_value: Any = None,
    strategy: str = "default",
) -> Any:
    if result.passed:
        return result.parsed
    if strategy == "raise":
        raise ValueError(result.error or "validation failed")
    if strategy == "notify":
        return {"error": result.error, "default": default_value}
    return default_value


def validate_tool_registration_payload(llm_output: str) -> ValidationResult:
    """register_tool 节点：期望含 name 的 JSON；warn 默认不阻断。"""
    return validate_with_retry(llm_output, JSONValidator(), max_retries=0)
