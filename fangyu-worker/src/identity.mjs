import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_ID_FILE = path.join(process.cwd(), 'data', 'worker-local.json')

export function loadWorkerIdentity(idFile = process.env.FANGYU_WORKER_ID_FILE || DEFAULT_ID_FILE) {
  try {
    const raw = fs.readFileSync(idFile, 'utf8')
    const data = JSON.parse(raw)
    if (data?.worker_id) return data
  } catch {
    /* no saved identity */
  }
  return null
}

export function saveWorkerIdentity(worker, idFile = process.env.FANGYU_WORKER_ID_FILE || DEFAULT_ID_FILE) {
  fs.mkdirSync(path.dirname(idFile), { recursive: true })
  fs.writeFileSync(
    idFile,
    JSON.stringify(
      {
        worker_id: worker.id,
        name: worker.name,
        saved_at: new Date().toISOString(),
      },
      null,
      2,
    ),
    'utf8',
  )
}
