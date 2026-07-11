# fangyu 集成 Cookbook

> Phase 5 — 开发者 1 小时上手：Bundle、A2A、外部 Agent、Adapter。

关联：[Phase 5 技术方案](PHASE5_TECH_SPEC.md) · [安全模型 v1](SECURITY_MODEL.md)

---

## 0. 前置

```powershell
py -m pip install -e .
py -m pip install -e ".[mqtt]"   # 可选：真实 MQTT
py -m fangyu --server             # http://127.0.0.1:8000
```

---

## 1. Happy Path（全自动脚本）

```powershell
py -3 scripts/happy_path_demo.py
```

等价手动五步：

```powershell
# 1) 画布导出 .bundle.zip 并解压到 ./MyWorker.bundle

# 2) 校验
py -3 -m fangyu bundle validate ./MyWorker.bundle

# 3) 启动 daemon
py -3 -m fangyu bundle run ./MyWorker.bundle --port 9001 --daemon

# 4) 本机 RPC（Bundle 内嵌私钥时自动签名）
py -3 -m fangyu bundle rpc ./MyWorker.bundle --url http://127.0.0.1:9001/rpc -m "hello"

# 5) 跨 Bundle：接收方添加信任
py -3 -m fangyu bundle trust add ./MyWorker.bundle --from ./Caller.bundle
```

---

## 2. 私钥环境变量（生产交付）

导出时不嵌入私钥（API `embed_private_key=false` 或后续 CLI）：

```powershell
$env:FANGYU_AGENT_PRIVATE_KEY = "<64hex Ed25519 private key>"
py -3 -m fangyu bundle run ./MyWorker.bundle --port 9001
py -3 -m fangyu bundle rpc ./MyWorker.bundle --url http://127.0.0.1:9001/rpc -m "signed call"
```

Bundle `identity.json` 仅含 `public_key` + `private_key_delivery: environment`。

---

## 3. 外部 Agent 联邦

### curl：发现 + 注册 + 授权

```powershell
# 假设远程 Bundle 运行在 :9001
curl -X POST http://127.0.0.1:8000/api/v1/a2a/agents/discover `
  -H "Content-Type: application/json" `
  -d "{\"rpc_url\": \"http://127.0.0.1:9001/rpc\"}"

curl -X POST http://127.0.0.1:8000/api/v1/a2a/agents/register_external `
  -H "Content-Type: application/json" `
  -d "{
    \"name\": \"remote_worker\",
    \"card\": { \"name\": \"RemoteWorker\", \"skills\": [{\"id\":\"default\"}] },
    \"rpc_url\": \"http://127.0.0.1:9001/rpc\",
    \"agent_id\": \"fyu:agent:...\",
    \"public_key\": \"<hex>\",
    \"authorized\": true,
    \"allowed_skills\": [\"*\"]
  }"

curl -X POST http://127.0.0.1:8000/api/v1/a2a/agents/remote_worker/authorize `
  -H "Content-Type: application/json" `
  -d "{\"authorized\": true, \"allowed_skills\": [\"default\"]}"
```

画布：Agent 编排 →「+ 外部 Agent」→ 填 RPC URL →「发现远程」→ 勾选授权。

---

## 4. MQTT Adapter

### 模拟（无需 broker）

```powershell
py -3 scripts/mqtt_demo.py --base http://127.0.0.1:8000
```

### 真实 broker

```powershell
$env:MQTT_BROKER_HOST = "127.0.0.1"
$env:MQTT_BROKER_PORT = "1883"
py -m pip install -e ".[mqtt]"

curl http://127.0.0.1:8000/api/v1/adapters/mqtt/health

curl -X POST http://127.0.0.1:8000/api/v1/adapters/mqtt/dispatch `
  -H "Content-Type: application/json" `
  -d "{\"agent_name\":\"MqttWorker\",\"topic\":\"sensors/temp\",\"payload\":{\"value\":95,\"alarm\":true}}"
```

---

## 5. PLC 产线 Demo

```powershell
py -3 scripts/plc_demo.py --base http://127.0.0.1:8000
```

---

## 6. Python SDK 片段

```python
from fangyu.core.agent_bundle import load_agent_bundle, add_trusted_peer, get_public_identity
from fangyu.engine.bundle_a2a_client import identity_from_bundle, rpc_call

bundle = load_agent_bundle("./MyWorker.bundle")
agent_id, identity = identity_from_bundle(bundle)

task = rpc_call(
    "http://127.0.0.1:9001/rpc",
    "a2a.send_message",
    {
        "targetAgent": "MyWorker",
        "message": {
            "role": "user",
            "parts": [{"type": "text", "text": "run skill"}],
            "metadata": {"skill_id": "default"},
        },
    },
    agent_id=agent_id,
    identity=identity,
)
print(task["status"]["state"])
```

---

## 7. 健康检查清单

| 检查 | 命令 |
|------|------|
| Bundle 结构 | `py -3 -m fangyu bundle validate ./agent` |
| Daemon 状态 | `curl http://127.0.0.1:9001/health` |
| 公钥发现 | `curl http://127.0.0.1:9001/identity/public` |
| Adapter 列表 | `curl http://127.0.0.1:8000/api/v1/adapters` |
| 单元测试 | `py -3 -m pytest tests/ -q` |

---

*版本：cookbook/1.0 — Phase 5*
