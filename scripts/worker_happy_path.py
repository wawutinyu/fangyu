#!/usr/bin/env python3
"""
方隅·序 → 方隅·行 Happy Path

前提：API 已启动  py -m fangyu --server

用法：
  py scripts/worker_happy_path.py
  py scripts/worker_happy_path.py --spawn-worker   # 脚本内临时拉起 Worker 进程
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request

DEFAULT_BASE = "http://127.0.0.1:8000"


def api(method: str, path: str, body: dict | None = None, base: str = DEFAULT_BASE):
    url = f"{base.rstrip('/')}{path}"
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if body is not None else {},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def wait_api(base: str, retries: int = 30) -> None:
    for _ in range(retries):
        try:
            api("GET", "/api/health", base=base)
            return
        except (urllib.error.URLError, TimeoutError):
            time.sleep(0.5)
    raise SystemExit(f"API 未就绪: {base}")


def poll_task_done(task_id: str, base: str, timeout: float = 60.0) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        task = api("GET", f"/api/v1/workers/tasks/{task_id}", base=base)["task"]
        if task["status"] in ("done", "failed"):
            return task
        time.sleep(1.0)
    raise TimeoutError(f"task {task_id} not finished in {timeout}s")


def main() -> int:
    parser = argparse.ArgumentParser(description="方隅 序→行 Happy Path")
    parser.add_argument("--base", default=DEFAULT_BASE)
    parser.add_argument("--spawn-worker", action="store_true", help="临时启动 fangyu-worker 子进程")
    args = parser.parse_args()

    print(f"[happy-path] 检查 API {args.base}")
    wait_api(args.base)

    worker_proc = None
    worker_name = None
    if args.spawn_worker:
        print("[happy-path] 启动临时 Worker…")
        worker_proc = subprocess.Popen(
            ["npm", "run", "start", "-w", "fangyu-worker"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            shell=True,
        )
        time.sleep(3)

    try:
        workers = api("GET", "/api/v1/workers", base=args.base).get("workers") or []
        online = [w for w in workers if w.get("online")]
        if online:
            worker_name = online[0]["name"]
            print(f"[happy-path] 在线 Worker: {worker_name}")

        # 1) shell 任务
        shell_body = {"type": "shell", "payload": {"command": "echo fangyu-worker-ok"}}
        if worker_name:
            shell_body["worker_name"] = worker_name
        created = api("POST", "/api/v1/workers/tasks", shell_body, base=args.base)
        task_id = created["task_id"]
        print(f"[happy-path] 已派发 shell 任务 {task_id}")

        task = poll_task_done(task_id, args.base)
        events = api("GET", f"/api/v1/workers/tasks/{task_id}/events", base=args.base)["events"]

        print(f"[happy-path] shell 状态: {task['status']}")
        if task.get("error"):
            print(f"[happy-path] 错误: {task['error']}")
        print(f"[happy-path] 事件数: {len(events)}")

        if task["status"] != "done":
            return 1
        stdout = (task.get("result") or {}).get("stdout", "")
        if "fangyu-worker-ok" not in stdout:
            print("[happy-path] 未在 stdout 中找到预期输出")
            return 1

        # 2) run_flow 空流程（验证命名派发 + 行端 /flow/run）
        flow_body = {
            "type": "run_flow",
            "payload": {
                "nodes": [],
                "edges": [],
                "global_vars": {"globalPrompts": {"system_prompt": "test", "user_prompt_template": "", "context": ""}},
                "snapshot_name": "happy-path",
            },
        }
        if worker_name:
            flow_body["worker_name"] = worker_name
        flow_created = api("POST", "/api/v1/workers/tasks", flow_body, base=args.base)
        flow_task_id = flow_created["task_id"]
        print(f"[happy-path] 已派发 run_flow 任务 {flow_task_id}")

        flow_task = poll_task_done(flow_task_id, args.base, timeout=90.0)
        print(f"[happy-path] run_flow 状态: {flow_task['status']}")
        if flow_task["status"] != "done":
            print(f"[happy-path] run_flow 失败: {flow_task.get('error')}")
            return 1

        print("[happy-path] ✅ 序 → 行 闭环成功（shell + run_flow）")
        return 0
    finally:
        if worker_proc:
            worker_proc.terminate()
            try:
                worker_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                worker_proc.kill()


if __name__ == "__main__":
    sys.exit(main())
