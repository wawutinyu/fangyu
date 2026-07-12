import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_POLICY_FILE = path.join(process.cwd(), 'data', 'worker-shell-policy.json')

const DEFAULT_DENY_PATTERNS = [
  String.raw`\brm\s+-[a-z]*f`,
  String.raw`\bdel\s+/[sfq]`,
  String.raw`\brmdir\s+/s\b`,
  String.raw`\bformat\s+[a-z]:`,
  String.raw`\bshutdown\b`,
  String.raw`\brestart\b`,
  String.raw`\bmkfs\b`,
  String.raw`Remove-Item\b.*-Recurse\b.*-Force`,
  String.raw`\breg\s+delete\b`,
  String.raw`\bdiskpart\b`,
]

/**
 * @typedef {'deny' | 'open' | 'allowlist'} ShellPolicyMode
 */

/**
 * @returns {{ mode: ShellPolicyMode, denyPatterns: string[], allowlist: string[] }}
 */
export function loadShellPolicy(policyFile = process.env.FANGYU_SHELL_POLICY_FILE || DEFAULT_POLICY_FILE) {
  const mode = /** @type {ShellPolicyMode} */ (
    process.env.FANGYU_SHELL_POLICY === 'open' || process.env.FANGYU_SHELL_POLICY === 'allowlist'
      ? process.env.FANGYU_SHELL_POLICY
      : 'deny'
  )

  let denyPatterns = DEFAULT_DENY_PATTERNS
  let allowlist = []

  try {
    const raw = fs.readFileSync(policyFile, 'utf8')
    const data = JSON.parse(raw)
    if (data.mode === 'open' || data.mode === 'deny' || data.mode === 'allowlist') {
      return {
        mode: data.mode,
        denyPatterns: Array.isArray(data.deny_patterns) ? data.deny_patterns : denyPatterns,
        allowlist: Array.isArray(data.allowlist) ? data.allowlist : [],
      }
    }
    if (Array.isArray(data.deny_patterns)) denyPatterns = data.deny_patterns
    if (Array.isArray(data.allowlist)) allowlist = data.allowlist
  } catch {
    /* use defaults */
  }

  return { mode, denyPatterns, allowlist }
}

/**
 * @param {string} command
 * @param {{ mode?: ShellPolicyMode, denyPatterns?: string[], allowlist?: string[] }} [policy]
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function checkShellCommand(command, policy = loadShellPolicy()) {
  const trimmed = command.trim()
  if (!trimmed) {
    return { allowed: false, reason: 'empty command' }
  }

  if (policy.mode === 'open') {
    return { allowed: true }
  }

  if (policy.mode === 'allowlist') {
    const hit = policy.allowlist?.some((entry) => {
      const e = entry.trim()
      if (!e) return false
      return trimmed === e || trimmed.startsWith(`${e} `) || trimmed.startsWith(`${e}\t`)
    })
    return hit ? { allowed: true } : { allowed: false, reason: 'not in shell allowlist' }
  }

  for (const pattern of policy.denyPatterns ?? DEFAULT_DENY_PATTERNS) {
    const re = new RegExp(pattern, 'i')
    if (re.test(trimmed)) {
      return { allowed: false, reason: `blocked by shell policy (${pattern})` }
    }
  }

  return { allowed: true }
}
