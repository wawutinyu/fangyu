"""A2A HTTP Transport — 基于 JSON-RPC 2.0 的 HTTP 传输层。"""
import json, threading, time
from typing import Optional
import urllib.request, urllib.error


class JSONRPCError(Exception):
    def __init__(self, code: int, message: str, data: object = None):
        self.code = code
        self.message = message
        self.data = data
        super().__init__(f"[{code}] {message}")


class HTTPTransport:
    def __init__(self, base_url: str = "", api_key: str = "", timeout: int = 30):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

    def call(self, method: str, params: dict = None, request_id: str = None) -> dict:
        import uuid
        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params or {},
            "id": request_id or uuid.uuid4().hex[:12],
        }
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(self.base_url, data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                result = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            raise JSONRPCError(e.code, f"HTTP {e.code}: {body[:200]}")
        except urllib.error.URLError as e:
            raise JSONRPCError(-1, f"Connection failed: {e.reason}")
        if "error" in result:
            err = result["error"]
            raise JSONRPCError(err.get("code", -1), err.get("message", "unknown error"), err.get("data"))
        return result.get("result", {})

    def send_message(self, target_url: str, message: dict, task_id: str = "") -> dict:
        return self.call("a2a.send_message", {"message": message, "taskId": task_id})

    def get_task(self, target_url: str, task_id: str) -> dict:
        return self.call("a2a.get_task", {"taskId": task_id})

    def list_tasks(self, target_url: str, agent_name: str = "") -> dict:
        return self.call("a2a.list_tasks", {"agentName": agent_name})

    def subscribe(self, target_url: str, callback_url: str, agent_name: str = "") -> dict:
        return self.call("a2a.subscribe", {"callbackUrl": callback_url, "agentName": agent_name})
