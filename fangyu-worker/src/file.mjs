import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_MAX_READ_BYTES = 512 * 1024

function workspaceRoot() {
  return process.env.FANGYU_WORKSPACE || process.cwd()
}

/**
 * @param {string} userPath
 * @returns {{ ok: true, abs: string } | { ok: false, error: string }}
 */
export function resolveWorkspacePath(userPath) {
  if (!userPath || typeof userPath !== 'string') {
    return { ok: false, error: 'missing path' }
  }
  const root = path.resolve(workspaceRoot())
  const abs = path.resolve(root, userPath)
  const rel = path.relative(root, abs)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, error: 'path outside workspace' }
  }
  return { ok: true, abs }
}

/**
 * @param {{ path: string, encoding?: string, maxBytes?: number }} opts
 */
export function readWorkspaceFile(opts) {
  const resolved = resolveWorkspacePath(opts.path)
  if (!resolved.ok) return { ok: false, error: resolved.error }

  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_READ_BYTES
  try {
    const stat = fs.statSync(resolved.abs)
    if (!stat.isFile()) {
      return { ok: false, error: 'not a file' }
    }
    if (stat.size > maxBytes) {
      return { ok: false, error: `file too large (${stat.size} > ${maxBytes})` }
    }
    const encoding = opts.encoding === 'base64' ? undefined : (opts.encoding || 'utf8')
    if (opts.encoding === 'base64') {
      const buf = fs.readFileSync(resolved.abs)
      return { ok: true, path: opts.path, content: buf.toString('base64'), encoding: 'base64', size: stat.size }
    }
    const content = fs.readFileSync(resolved.abs, encoding)
    return { ok: true, path: opts.path, content, encoding, size: stat.size }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * @param {{ path: string, content: string, encoding?: string, mkdir?: boolean }} opts
 */
export function writeWorkspaceFile(opts) {
  const resolved = resolveWorkspacePath(opts.path)
  if (!resolved.ok) return { ok: false, error: resolved.error }

  try {
    if (opts.mkdir !== false) {
      fs.mkdirSync(path.dirname(resolved.abs), { recursive: true })
    }
    const encoding = opts.encoding === 'base64' ? undefined : (opts.encoding || 'utf8')
    if (opts.encoding === 'base64') {
      fs.writeFileSync(resolved.abs, Buffer.from(opts.content || '', 'base64'))
    } else {
      fs.writeFileSync(resolved.abs, opts.content ?? '', encoding)
    }
    const stat = fs.statSync(resolved.abs)
    return { ok: true, path: opts.path, size: stat.size }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
