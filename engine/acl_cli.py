"""CLI: python -m fangyu acl ..."""
from __future__ import annotations

import argparse
import json
import sys


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="fangyu acl", description="组织 ACL（G2-C）")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("show", help="显示当前 ACL")
    init_p = sub.add_parser("init", help="初始化默认组织 ACL")
    init_p.add_argument("--org", default="方隅默认组织")
    init_p.add_argument("--disabled", action="store_true", help="初始化但保持关闭")
    en = sub.add_parser("enable", help="启用 ACL")
    en.add_argument("--require-principal", action="store_true", default=True)
    sub.add_parser("disable", help="关闭 ACL")

    add = sub.add_parser("member-add", help="添加成员")
    add.add_argument("member_id")
    add.add_argument("--name", default="")
    add.add_argument("--role", action="append", dest="roles", default=None)

    roles = sub.add_parser("member-roles", help="设置成员角色")
    roles.add_argument("member_id")
    roles.add_argument("--role", action="append", dest="roles", required=True)

    rm = sub.add_parser("member-rm", help="删除成员")
    rm.add_argument("member_id")

    chk = sub.add_parser("check", help="校验权限")
    chk.add_argument("--principal", required=True)
    chk.add_argument("--agent", default="")
    chk.add_argument("--skill", default="")
    chk.add_argument("--tool", default="")

    bind = sub.add_parser("bundle-bind", help="把当前 ACL 写入 Bundle config/acl.json")
    bind.add_argument("bundle_dir")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    from fangyu.core import org_acl as acl

    if args.cmd == "show":
        print(json.dumps(acl.load_acl(), ensure_ascii=False, indent=2))
        return 0
    if args.cmd == "init":
        doc = acl.init_acl(
            org_name=args.org,
            enabled=not args.disabled,
            require_principal=not args.disabled,
        )
        print(json.dumps(doc, ensure_ascii=False, indent=2))
        return 0
    if args.cmd == "enable":
        print(json.dumps(acl.enable_acl(True, require_principal=True), ensure_ascii=False, indent=2))
        return 0
    if args.cmd == "disable":
        print(json.dumps(acl.enable_acl(False), ensure_ascii=False, indent=2))
        return 0
    if args.cmd == "member-add":
        print(json.dumps(
            acl.add_member(args.member_id, name=args.name, roles=args.roles or ["viewer"]),
            ensure_ascii=False, indent=2,
        ))
        return 0
    if args.cmd == "member-roles":
        try:
            print(json.dumps(acl.set_member_roles(args.member_id, args.roles), ensure_ascii=False, indent=2))
            return 0
        except KeyError as e:
            print(json.dumps({"error": str(e)}), file=sys.stderr)
            return 1
    if args.cmd == "member-rm":
        try:
            print(json.dumps(acl.remove_member(args.member_id), ensure_ascii=False, indent=2))
            return 0
        except KeyError as e:
            print(json.dumps({"error": str(e)}), file=sys.stderr)
            return 1
    if args.cmd == "check":
        try:
            acl.assert_org_allowed(
                args.principal,
                agent=args.agent or None,
                skill=args.skill or None,
                tool=args.tool or None,
            )
            print(json.dumps({"allowed": True, "principal": args.principal}, ensure_ascii=False, indent=2))
            return 0
        except acl.ACLError as e:
            print(json.dumps({
                "allowed": False, "rule": e.rule, "message": str(e),
            }, ensure_ascii=False, indent=2))
            return 1
    if args.cmd == "bundle-bind":
        path = acl.write_bundle_acl(args.bundle_dir)
        print(json.dumps({"ok": True, "acl": str(path)}, ensure_ascii=False, indent=2))
        return 0
    return 1
