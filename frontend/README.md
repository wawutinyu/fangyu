# AI Flow Canvas — Frontend

React + Vite + Redux + ReactFlow visual flow editor.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server (port 5173, proxies /api to localhost:8000) |
| `npm run build` | Production build (code-split chunks for react/vendor/codemirror) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `oxlint .` |
| `npx vitest run` | Unit tests (127 tests) |
| `npx playwright test` | E2E tests (34 tests) |

## Structure

```
src/
├── components/
│   ├── App.tsx              → Root (Flow/Agent tab switching, always-mounted canvases)
│   ├── FlowCanvas.tsx       → DAG flow editor (ReactFlow)
│   ├── AgentCanvas.tsx      → Agent orchestration canvas (agent/router/group nodes)
│   ├── AgentNode.tsx        → Agent node component
│   ├── RouterNode.tsx       → Router node component (rule dispatch)
│   ├── GroupNode.tsx        → Group container node
│   ├── ConfigPanel.tsx      → Flow node config panel (with VariableSelector)
│   ├── AgentConfigPanel.tsx → Agent config panel (AgentCard/ATP/Transport/Task/Ext + routing rules)
│   ├── ExportDialog.tsx     → Export dialog (A2A toggle + compile)
│   ├── ChatInterface.tsx    → Dual-mode chat (Flow / Agent)
│   └── VariableSelector.tsx → Cursor-position-aware variable insertion
├── store/
│   ├── flowSlice.ts         → Flow canvas state (nodes/edges/selection/undo)
│   └── agentSlice.ts        → Agent canvas state (agent/router/group)
├── utils/
│   ├── a2aProtocol.ts       → A2A v1.0 data models (Task/Message/Part/AgentCard/RouterNodeData)
│   ├── agentTrust.ts        → ATP data models (Identity/Envelope/Registry)
│   ├── agentCodeGenerator.ts→ Generate full a2a/ + trust/ + main.py Python module tree
│   ├── agentCardGenerator.ts→ Per-agent Python file generation
│   ├── exportFlow.ts        → Export bundle entry (A2A switches, build.sh)
│   └── agentBus.ts          → Browser-side AgentBus simulation (in-memory)
```

## Key Design Decisions

- Both canvases always mounted (`display: none` toggle) — no state loss on tab switch
- `updateNodeData` calls `pushHistory()` — undo/redo works for label edits
- VariableSelector inserts at cursor position (not append) — tracked via `cursorPosRef`
- Code splitting via `manualChunks` function — production build chunks < 500KB
