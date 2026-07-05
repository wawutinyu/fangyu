import type { Node, Edge } from 'reactflow'
import { generatePythonCode, type GenerateOptions } from './codeGenerator'
import { generateA2AModules, generateMainPy, generateRouterAgentFile } from './agentCodeGenerator'
import { generateAgentPythonFiles } from './agentCardGenerator'
import type { AgentCanvasNode } from '../store/agentSlice'

export interface FlowExportBundle {
  pyFile: string
  buildBat: string
  requirementsTxt: string
  extraFiles: { filename: string; content: string }[]
}

const API_BASE = '/api/v1/export'

/**
 * 一键导出：生成源码 → 发送后端编译 → 下载 ZIP（含 .json / .py / .bat / .txt / .exe）
 * @param nodes 画布节点
 * @param edges 画布连线
 * @param options 代码生成选项
 * @param backendUrl API 地址（默认 '' 即同域）
 */
function _downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * 一键导出：后端编译 .exe 并打包为含源码 + a2a/ + trust/ + .exe 的 ZIP，一次下载完成。
 */
export async function downloadFlowExport(
  nodes: Node[],
  edges: Edge[],
  options: GenerateOptions & { enableA2A?: boolean } = {},
  backendUrl: string = '',
  onCompileProgress?: () => void,
  agentNodes?: AgentCanvasNode[],
): Promise<void> {
  const bundle = getFlowExportBundle(nodes, edges, options, agentNodes)
  const flowConfig = { nodes, edges, options }

  onCompileProgress?.()
  const res = await fetch(`${backendUrl}${API_BASE}/compile-bundle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pyCode: bundle.pyFile,
      buildBat: bundle.buildBat,
      requirements: bundle.requirementsTxt,
      flowConfig,
      extraFiles: bundle.extraFiles,
    }),
    signal: AbortSignal.timeout(660_000),
  })
  if (!res.ok) {
    let detail = ''
    try { const j = await res.json(); detail = j.detail } catch { detail = await res.text() }
    throw new Error(`导出失败 (${res.status}): ${detail.slice(0, 200)}`)
  }
  _downloadBlob(await res.blob(), 'flow_export_bundle.zip')
}

const BUILD_SH_TEMPLATE = `#!/usr/bin/env bash
set -e
echo "========================================"
echo " AI Flow Canvas — Build Executable"
echo "========================================"
echo ""

if ! command -v python3 &> /dev/null; then
    echo "[ERROR] Python3 not found. Install Python 3.9+ first."
    exit 1
fi

echo "[1/3] Installing dependencies..."
pip3 install -r requirements.txt

echo "[2/3] Compiling to executable..."
pyinstaller --onefile --noconsole --name flow_export flow_export.py

echo "[3/3] Done!"
echo "Executable: dist/flow_export"
echo "Run: ./dist/flow_export"
`

const BUILD_BAT_TEMPLATE = `@echo off
chcp 65001 >nul
echo ========================================
echo  AI Flow Canvas — 编译为可执行文件
echo ========================================
echo.

:: 检查 Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 Python，请先安装 Python 3.9+
    pause
    exit /b 1
)

:: 安装依赖
echo [1/3] 安装依赖…
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [错误] 依赖安装失败
    pause
    exit /b 1
)

:: 编译
echo [2/3] 正在编译为 .exe（首次编译可能较慢）…
pyinstaller --onefile --noconsole --name flow_export flow_export.py
if %errorlevel% neq 0 (
    echo [错误] 编译失败
    pause
    exit /b 1
)

:: 完成
echo [3/3] 编译成功！
echo.
echo 可执行文件位于: dist\\flow_export.exe
echo 双击 dist\\flow_export.exe 即可运行。
pause
`

const REQUIREMENTS_TEMPLATE = `# AI Flow Canvas — 导出流程运行时依赖
# 安装: pip install -r requirements.txt

cryptography>=41.0.0
pyinstaller>=6.0.0
`

export function getFlowExportBundle(
  nodes: Node[], edges: Edge[],
  options: GenerateOptions & { enableA2A?: boolean } = {},
  agentNodes?: AgentCanvasNode[],
): FlowExportBundle {
  const pyCode = generatePythonCode(nodes, edges, { ...options, desktopGUI: true })
  const enableA2A = options.enableA2A ?? false

  const extraFiles: { filename: string; content: string }[] = []

  if (enableA2A) {
    // Add a2a/ module tree
    const a2aModules = generateA2AModules(true)
    for (const m of a2aModules) {
      extraFiles.push({ filename: m.filename, content: m.content })
    }

    // Add a2a/agents/ per-agent files
    if (agentNodes && agentNodes.length > 0) {
      const agentFiles = generateAgentPythonFiles(
        agentNodes.map(n => ({ id: n.id, card: n.agentCard }))
      )
      for (const f of agentFiles) {
        extraFiles.push({ filename: `a2a/agents/${f.filename}`, content: f.content })
      }
    }

    // Add router agents
    const routerAgents = (agentNodes || []).filter(n => n.type === 'a2a-router')
    if (routerAgents.length > 0) {
      const routerFiles = generateRouterAgentFile(
        routerAgents.map(n => ({
          id: n.id,
          label: n.label,
          rules: (n.routingRules || []).map(r => ({
            sourceSkill: r.sourceSkill,
            targetAgentId: r.targetAgentId,
            condition: r.condition,
            priority: r.priority,
          })),
          defaultTarget: n.defaultTarget,
        }))
      )
      for (const f of routerFiles) {
        extraFiles.push({ filename: f.filename, content: f.content })
      }
    }

    // Override main.py
    extraFiles.push({ filename: 'main.py', content: generateMainPy(true) })
  }

  // Add build.sh for Linux/macOS
  extraFiles.push({ filename: 'build.sh', content: BUILD_SH_TEMPLATE })

  return { pyFile: pyCode, buildBat: BUILD_BAT_TEMPLATE, requirementsTxt: REQUIREMENTS_TEMPLATE, extraFiles }
}

export function getFlowExportFilenames(): { pyFile: string; buildBat: string; requirementsTxt: string } {
  return {
    pyFile: 'flow_export.py',
    buildBat: 'build_exe.bat',
    requirementsTxt: 'requirements.txt',
  }
}

export type { GenerateOptions }
