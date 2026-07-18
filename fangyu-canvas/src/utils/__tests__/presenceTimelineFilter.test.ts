import { describe, expect, it } from 'vitest'
import {
  eventMatchesTimelineFilter,
  timelineFilterForFocusKind,
} from '../presenceTimelineFilter'

describe('presenceTimelineFilter', () => {
  it('factory.align matches factory and ops', () => {
    expect(eventMatchesTimelineFilter('factory.align', 'factory')).toBe(true)
    expect(eventMatchesTimelineFilter('factory.align', 'ops')).toBe(true)
    expect(eventMatchesTimelineFilter('factory.align', 'eval')).toBe(false)
    expect(eventMatchesTimelineFilter('factory.align', 'host')).toBe(false)
    expect(eventMatchesTimelineFilter('factory.align', 'all')).toBe(true)
  })

  it('timelineFilterForFocusKind', () => {
    expect(timelineFilterForFocusKind('factory.align')).toBe('factory')
    expect(timelineFilterForFocusKind('eval.health_regression')).toBe('eval')
    expect(timelineFilterForFocusKind('host.offline')).toBe('host')
    expect(timelineFilterForFocusKind('a2a.send')).toBe(null)
  })
})
