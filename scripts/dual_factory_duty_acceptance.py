#!/usr/bin/env python3
"""双厂值班验收（P1）— 无 API Key。

签字清单（两进程）：
  D1 西厂 Bundle 起服
  D2 东厂平台起服（独立 DATA_DIR）
  D3 探测入库
  D4 批量心跳 → 在线
  D5 观/主机可见
  D6 人为停西厂 → 心跳离线 + 告警
  D7 西厂恢复 → 再探测在线
  D8 Presence 对齐
  D9 时间轴含 factory.offline / factory.online（或等价）

退出码：
  0 全绿
  1 失败
  2 跳过（Windows / 无法绑端口）

用法（仓库根）::

    python scripts/dual_factory_duty_acceptance.py
    python scripts/dual_factory_duty_acceptance.py --keep
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _can_bind() -> bool:
    try:
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
        return True
    except OSError:
        return False


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _http_json(
    method: str,
    url: str,
    body: dict[str, Any] | None = None,
    *,
    timeout: float = 20.0,
) -> tuple[int, Any]:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"} if body is not None else {},
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {"detail": raw}
        return int(exc.code), payload


def _wait_url(url: str, *, timeout: float = 30.0) -> None:
    deadline = time.time() + timeout
    last: Exception | None = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    return
        except Exception as exc:  # noqa: BLE001 — 启动等待
            last = exc
            time.sleep(0.3)
    raise TimeoutError(f"not ready: {url} ({last})")


def _mark(ok: bool, label: str, detail: str = "") -> bool:
    tag = "OK" if ok else "FAIL"
    suffix = f" — {detail}" if detail else ""
    print(f"[{tag}] {label}{suffix}")
    return ok


def _terminate(proc: subprocess.Popen | None) -> None:
    if proc is None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=6)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=3)


def main() -> int:
    parser = argparse.ArgumentParser(description="Dual-factory duty acceptance (P1)")
    parser.add_argument("--keep", action="store_true", help="保留临时目录")
    args = parser.parse_args()

    if sys.platform == "win32":
        print("[SKIP] dual-factory duty — Windows subprocess flaky")
        return 2
    if not _can_bind():
        print("[SKIP] dual-factory duty — localhost bind blocked")
        return 2

    from fangyu.core.agent_bundle import create_agent_bundle

    work = Path(tempfile.mkdtemp(prefix="fangyu-duty-"))
    east_data = work / "east-data"
    east_data.mkdir(parents=True)
    west_dir = work / "west"
    west_port = _free_port()
    east_port = _free_port()
    west_base = f"http://127.0.0.1:{west_port}"
    east_base = f"http://127.0.0.1:{east_port}"

    west_proc: subprocess.Popen | None = None
    east_proc: subprocess.Popen | None = None
    results: list[bool] = []

    print(f"==> dual-factory duty @ {work}")
    print(f"    east={east_base}  west={west_base}")

    try:
        # D1 west
        create_agent_bundle(
            west_dir,
            name="西厂值班",
            worker_only=True,
            a2a_port=west_port,
            require_envelope=False,
        )
        west_proc = subprocess.Popen(
            [sys.executable, "-m", "fangyu", "bundle", "run", str(west_dir), "--port", str(west_port)],
            cwd=str(ROOT),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        try:
            _wait_url(f"{west_base}/health")
            results.append(_mark(True, "D1 西厂 Bundle 起服", west_base))
        except Exception as exc:
            results.append(_mark(False, "D1 西厂 Bundle 起服", str(exc)))
            raise

        # D2 east platform
        env = {
            **os.environ,
            "FANGYU_DATA_DIR": str(east_data),
            "PORT": str(east_port),
            "HOST": "127.0.0.1",
        }
        east_proc = subprocess.Popen(
            [sys.executable, "-m", "fangyu", "--server"],
            cwd=str(ROOT),
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        try:
            _wait_url(f"{east_base}/api/health", timeout=40.0)
            results.append(_mark(True, "D2 东厂平台起服", east_base))
        except Exception as exc:
            err = ""
            if east_proc.stderr:
                err = (east_proc.stderr.read() or b"")[-800:].decode("utf-8", errors="replace")
            results.append(_mark(False, "D2 东厂平台起服", f"{exc} {err[:200]}"))
            raise

        # D3 probe-save
        code, body = _http_json(
            "POST",
            f"{east_base}/api/v1/a2a/factories/probe-save",
            {"base_url": west_base, "label": "西厂值班"},
        )
        ok3 = code == 200 and bool(body.get("ok")) and bool(body.get("persisted"))
        fid = str((body.get("factory") or {}).get("id") or "")
        results.append(_mark(ok3, "D3 探测入库", f"id={fid or '—'} http={code}"))
        if not ok3:
            raise RuntimeError("probe-save failed")

        # D4 heartbeat online
        code, hb = _http_json(
            "POST",
            f"{east_base}/api/v1/a2a/factories/heartbeat",
            {"sync_presence": True},
        )
        ok4 = code == 200 and int(hb.get("online") or 0) >= 1 and int(hb.get("offline") or 0) == 0
        results.append(_mark(ok4, "D4 批量心跳 → 在线", f"online={hb.get('online')} total={hb.get('total')}"))

        # D5 presence / hosts
        code, presence = _http_json("GET", f"{east_base}/api/v1/presence")
        events = presence.get("events") if isinstance(presence, dict) else None
        if events is None and isinstance(presence, dict):
            events = (presence.get("presence") or {}).get("events")
        # API shape: { presence, events, ... }
        ev_list = events if isinstance(events, list) else []
        if not ev_list and isinstance(presence, dict):
            # some builds nest under presence.timeline
            nested = presence.get("presence")
            if isinstance(nested, dict) and isinstance(nested.get("events"), list):
                ev_list = nested["events"]
        kinds = {str(e.get("kind") or "") for e in ev_list if isinstance(e, dict)}
        code_h, hosts_body = _http_json("GET", f"{east_base}/api/v1/presence/hosts")
        hosts = hosts_body if isinstance(hosts_body, list) else (hosts_body.get("hosts") if isinstance(hosts_body, dict) else [])
        if not isinstance(hosts, list):
            hosts = []
        fac_hosts = [
            h for h in hosts
            if isinstance(h, dict) and (
                h.get("role") == "factory"
                or str(h.get("id") or "").startswith("factory:")
                or west_base in str(h.get("base_url") or "")
            )
        ]
        ok5 = code == 200 and (
            bool(fac_hosts)
            or "host.heartbeat" in kinds
            or "factory.online" in kinds
        )
        results.append(_mark(
            ok5,
            "D5 观/主机可见",
            f"hosts={len(fac_hosts)} kinds={sorted(k for k in kinds if k)[:6]}",
        ))

        # D6 kill west → offline + alert
        _terminate(west_proc)
        west_proc = None
        time.sleep(0.4)
        code, hb2 = _http_json(
            "POST",
            f"{east_base}/api/v1/a2a/factories/heartbeat",
            {"sync_presence": True, "factory_ids": [fid] if fid else None},
        )
        offline_n = int(hb2.get("offline") or 0)
        online_n = int(hb2.get("online") or 0)
        code_a, alerts = _http_json("GET", f"{east_base}/api/v1/monitor/alerts")
        alert_list = alerts.get("alerts") if isinstance(alerts, dict) else alerts
        if not isinstance(alert_list, list):
            alert_list = []
        has_offline_alert = any(
            isinstance(a, dict) and a.get("kind") in ("factory.offline", "host.offline")
            for a in alert_list
        )
        # also accept factories meta.alert from list
        code_f, facs = _http_json("GET", f"{east_base}/api/v1/a2a/factories")
        rows = facs if isinstance(facs, list) else (facs.get("factories") if isinstance(facs, dict) else [])
        if not isinstance(rows, list):
            rows = []
        meta_offline = any(
            isinstance(r, dict)
            and (r.get("online") is False or (r.get("meta") or {}).get("alert") == "offline")
            for r in rows
        )
        ok6 = (
            code == 200
            and online_n == 0
            and (offline_n >= 1 or meta_offline)
            and (has_offline_alert or meta_offline)
        )
        results.append(_mark(
            ok6,
            "D6 人为离线 → 心跳+告警",
            f"online={online_n} offline={offline_n} alert={has_offline_alert} meta={meta_offline}",
        ))

        # D7 restart west → retest online
        west_proc = subprocess.Popen(
            [sys.executable, "-m", "fangyu", "bundle", "run", str(west_dir), "--port", str(west_port)],
            cwd=str(ROOT),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        _wait_url(f"{west_base}/health")
        code, hb3 = _http_json(
            "POST",
            f"{east_base}/api/v1/a2a/factories/heartbeat",
            {"sync_presence": True},
        )
        ok7 = code == 200 and int(hb3.get("online") or 0) >= 1
        results.append(_mark(ok7, "D7 恢复后心跳在线", f"online={hb3.get('online')}"))

        # D8 align
        code, aligned = _http_json(
            "POST",
            f"{east_base}/api/v1/a2a/factories/align",
            {"import_hosts": True, "export_factories": True, "retest_after": True},
        )
        ok8 = code == 200 and bool(aligned.get("ok", True) or aligned.get("heartbeat") or aligned.get("exported") is not None or "imported" in aligned)
        # align returns various shapes; accept 200 with factories still online after
        if code == 200:
            code_hb, hb4 = _http_json(
                "POST",
                f"{east_base}/api/v1/a2a/factories/heartbeat",
                {"sync_presence": True},
            )
            ok8 = code_hb == 200 and int(hb4.get("online") or 0) >= 1
        results.append(_mark(ok8, "D8 Presence 对齐", f"http={code}"))

        # D9 timeline kinds
        code, presence2 = _http_json("GET", f"{east_base}/api/v1/presence")
        ev2: list[Any] = []
        if isinstance(presence2, dict):
            if isinstance(presence2.get("events"), list):
                ev2 = presence2["events"]
            elif isinstance((presence2.get("presence") or {}), dict):
                ev2 = list((presence2["presence"] or {}).get("events") or [])
        kinds2 = {str(e.get("kind") or "") for e in ev2 if isinstance(e, dict)}
        ok9 = (
            "factory.offline" in kinds2
            or "host.offline" in kinds2
        ) and (
            "factory.online" in kinds2
            or "host.heartbeat" in kinds2
            or "factory.retest" in kinds2
            or "factory.align" in kinds2
        )
        results.append(_mark(
            ok9,
            "D9 观事件含离线/上线闭环",
            f"kinds={sorted(k for k in kinds2 if 'factory' in k or 'host' in k or 'offline' in k)}",
        ))

    except Exception as exc:
        if not results or results[-1] is True:
            print(f"[FAIL] aborted — {exc}")
            results.append(False)
    finally:
        _terminate(west_proc)
        _terminate(east_proc)
        if args.keep:
            print(f"保留目录: {work}")
        else:
            shutil.rmtree(work, ignore_errors=True)

    print()
    fails = sum(1 for r in results if not r)
    if fails:
        print(f"[FAIL] 双厂值班验收未过（fail={fails}/{len(results)}）")
        return 1
    print(f"[OK] 双厂值班验收全绿（{len(results)} 项）— 可签字")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
