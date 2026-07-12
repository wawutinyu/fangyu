import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { buildSeedAgentAssets } from '../src/utils/seedAgents'

const assets = buildSeedAgentAssets().map(a => ({
  id: a.id,
  type: 'agent_topology',
  name: a.name,
  description: a.description,
  category: a.category,
  tags: a.tags,
  source_ref: `official:${a.id}`,
  version: '1',
  payload: a.payload,
}))

const dir = join(import.meta.dirname, '..', '..', 'data', 'assets')
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, 'official_agents.json'), JSON.stringify({ assets }, null, 2), 'utf-8')
console.log(`exported ${assets.length} seed agents -> data/assets/official_agents.json`)
