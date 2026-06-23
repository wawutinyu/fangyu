import { describe, it, expect, vi } from 'vitest'
import { createEdgeGenerator } from '@logicflow/core/es/util/edge.js'
import { FlowEdgeModel } from '../plugins/customEdges.js'

function makeMockGraphModel(edgeType = 'flow-edge') {
  return {
    edgeType,
    getModel: () => null,
    modelMap: new Map(),
    idGenerator: null,
    nodesMap: {},
    eventCenter: { on: vi.fn(), emit: vi.fn() },
    editConfigModel: { adjustEdgeStartAndEnd: false },
    overlapMode: 'DEFAULT',
    theme: {
      edge: { stroke: '#000', strokeWidth: 1 },
      edgeAnimation: {},
      arrow: {},
    },
    nodes: [],
    edges: [],
  }
}

describe('createEdgeGenerator', () => {
  it('returns default type when no generator provided', () => {
    const gen = createEdgeGenerator(makeMockGraphModel('flow-edge'), null)
    expect(gen(null, null)).toEqual({ type: 'flow-edge' })
  })

  it('returns type string when generator returns a string', () => {
    const gen = createEdgeGenerator(makeMockGraphModel('polyline'), () => 'custom-edge')
    const result = gen(null, null)
    expect(result.type).toBe('custom-edge')
  })

  it('merges result object correctly (the original bug)', () => {
    const gen = createEdgeGenerator(makeMockGraphModel('polyline'), () => ({
      type: 'flow-edge',
      properties: { linkType: 'serial' },
    }))
    const result = gen(null, null)
    expect(result.type).toBe('flow-edge')
    expect(result.properties).toEqual({ linkType: 'serial' })
  })

  it('preserves currentEdge when merging object result', () => {
    const gen = createEdgeGenerator(makeMockGraphModel('polyline'), () => ({
      type: 'flow-edge',
      properties: { linkType: 'serial' },
    }))
    const result = gen(null, null, { sourceNodeId: 'a', targetNodeId: 'b' })
    expect(result.type).toBe('flow-edge')
    expect(result.sourceNodeId).toBe('a')
    expect(result.targetNodeId).toBe('b')
  })

  it('returns default type when generator returns null', () => {
    const gen = createEdgeGenerator(makeMockGraphModel('default-edge'), () => null)
    expect(gen(null, null)).toEqual({ type: 'default-edge' })
  })
})

describe('FlowEdgeModel', () => {
  const baseData = {
    id: 'test-edge-1',
    type: 'flow-edge',
    sourceNodeId: 'src-1',
    targetNodeId: 'tgt-1',
    sourceAnchorId: 'src-anchor',
    targetAnchorId: 'tgt-anchor',
    startPoint: { x: 0, y: 0 },
    endPoint: { x: 100, y: 0 },
    pointsList: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
  }

  it('applies serial style by default', () => {
    const model = new FlowEdgeModel(baseData, makeMockGraphModel())
    const style = model.getEdgeStyle()
    expect(style.stroke).toBe('#37352f')
    expect(style.strokeDasharray).toBe('')
  })

  it('applies branch style', () => {
    const model = new FlowEdgeModel({
      ...baseData,
      properties: { linkType: 'branch' },
    }, makeMockGraphModel())
    const style = model.getEdgeStyle()
    expect(style.stroke).toBe('#fa8c16')
    expect(style.strokeDasharray).toBe('5,3')
  })

  it('applies parallel style', () => {
    const model = new FlowEdgeModel({
      ...baseData,
      properties: { linkType: 'parallel' },
    }, makeMockGraphModel())
    const style = model.getEdgeStyle()
    expect(style.stroke).toBe('#722ed1')
    expect(style.strokeDasharray).toBe('2,2')
  })
})
