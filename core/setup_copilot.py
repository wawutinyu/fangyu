"""Setup Copilot — 粘贴外部 Agent URL → 人话确认信任文案（Phase 6 MVP）。"""
from __future__ import annotations

from typing import Any


def build_trust_preview(
    *,
    rpc_url: str,
    card: dict[str, Any] | None,
    identity: dict[str, Any] | None,
) -> dict[str, Any]:
    """根据发现结果生成白话确认文案与风险点（不自动授权）。"""
    card = card or {}
    identity = identity or {}
    name = str(card.get("name") or identity.get("agent_id") or "未知 Agent")
    desc = str(card.get("description") or "（对方未提供描述）")
    skills = card.get("skills") or []
    skill_names: list[str] = []
    for s in skills:
        if isinstance(s, dict):
            skill_names.append(str(s.get("name") or s.get("id") or "?"))
        else:
            skill_names.append(str(s))
    has_id = bool(identity.get("agent_id"))
    has_key = bool(identity.get("public_key"))
    require_envelope = bool(identity.get("require_envelope"))

    risks: list[str] = []
    if not has_id or not has_key:
        risks.append("未能拿到完整身份（agent_id / 公钥），加密互信可能不完整。")
    if not skill_names:
        risks.append("对方没有声明技能列表，授权后能力边界不清晰。")
    if not require_envelope:
        risks.append("对方未强制加密信封，通信可能走明文扩展路径。")
    if "http://" in rpc_url and "127.0.0.1" not in rpc_url and "localhost" not in rpc_url:
        risks.append("使用非本机 HTTP（非 HTTPS），中间人风险更高。")

    plain = (
        f"即将接入外部 Agent「{name}」。\n"
        f"它自称：{desc}\n"
        f"技能：{('、'.join(skill_names) if skill_names else '未声明')}\n"
        f"地址：{rpc_url}\n"
        f"\n"
        f"请用人话确认：是否允许它加入本机协作网络？"
        f"默认仅登记、不自动授权；你确认后才会打开调用权限。"
    )
    confirm_prompt = (
        f"我确认信任「{name}」，允许它以声明的技能参与协作；"
        f"若行为异常，我将在方隅·律中吊销授权。"
    )
    return {
        "name": name,
        "description": desc,
        "skills": skill_names,
        "rpc_url": rpc_url,
        "agent_id": identity.get("agent_id"),
        "has_identity": has_id and has_key,
        "require_envelope": require_envelope,
        "risks": risks,
        "plain": plain,
        "confirm_prompt": confirm_prompt,
        "recommended_authorized": False,
    }


def preview_from_discover_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return build_trust_preview(
        rpc_url=str(payload.get("rpc_url") or ""),
        card=payload.get("card") if isinstance(payload.get("card"), dict) else {},
        identity=payload.get("identity") if isinstance(payload.get("identity"), dict) else {},
    )
