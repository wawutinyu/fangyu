# AI Flow Canvas

a visual flow editor with DAG execution, A2A agent orchestration, and ATP trust protocol for building AI workflows.

## Architecture

```
frontend/         → React + Vite + Redux + ReactFlow
backend/          → FastAPI + uvicorn (flow execution engine)
tests/            → Python A2A/ATP runtime tests
```

### Two Canvases

| Canvas | Technology | Purpose |
|---|---|---|
| Flow | DAG + ReactFlow | Visual pipeline editor — chain LLM, search, condition, loop, code execution nodes |
| Agent | A2A Protocol | Agent orchestration with subscribe-based communication, Ed25519 trust signing |

### Protocol Stack

- **A2A v1.0** (full) — Task/Message/Part/Artifact/AgentCard, SendMessage/GetTask/ListTasks/Subscribe
- **ATP** (Agent Trust Protocol) — Ed25519 signatures, TrustRegistry (authz + revocation), TrustAnchor, nonce replay protection

### Export

- Generates runnable Python code with the full a2a/ + trust/ module tree
- Compiles to standalone .exe via PyInstaller
- `--enable-a2a` / `--disable-a2a` CLI toggle

## Quick Start

### Frontend

```bash
cd frontend
npm install
npm run dev      # → http://localhost:5173
```

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Tests

```bash
# Frontend (vitest)
cd frontend && npx vitest run

# E2E (Playwright)
cd frontend && npx playwright test

# Python A2A
python -m pytest tests/ -v

# Backend API (start backend first)
python tests/check_all_features_api.py
```

## Test Status

- **179 tests total**: 127 vitest unit + 34 Playwright e2e + 18 Python pytest
- Full CI: TypeScript check → oxlint → vitest → build → Playwright → pytest → backend API

## License

MIT
