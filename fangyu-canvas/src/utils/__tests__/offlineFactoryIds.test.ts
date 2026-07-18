import { describe, expect, it } from 'vitest'
import { offlineFactoryIds } from '../../components/FactoryOfflineRetestButton'

describe('offlineFactoryIds', () => {
  it('picks offline factories with ids', () => {
    expect(offlineFactoryIds([
      { id: 'a', online: false },
      { id: 'b', online: true },
      { id: 'c', online: false },
      { online: false },
    ])).toEqual(['a', 'c'])
  })
})
