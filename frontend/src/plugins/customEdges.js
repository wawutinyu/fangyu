import { PolylineEdge, PolylineEdgeModel } from '@logicflow/core'

export class FlowEdgeModel extends PolylineEdgeModel {
  setAttributes() {
    super.setAttributes()
    const linkType = this.properties.linkType || 'serial'
    if (linkType === 'branch') {
      this.strokeDashArray = '5 3'
      this.stroke = '#fa8c16'
    } else if (linkType === 'parallel') {
      this.strokeDashArray = '2 2'
      this.stroke = '#722ed1'
    } else {
      this.strokeDashArray = '0'
      this.stroke = '#37352f'
    }
    this.strokeWidth = 1.5
    this.textWidth = 0
    this.textHeight = 0
  }

  getEdgeStyle() {
    const style = super.getEdgeStyle()
    const linkType = this.properties.linkType || 'serial'
    style.stroke = linkType === 'branch' ? '#fa8c16' : linkType === 'parallel' ? '#722ed1' : '#37352f'
    style.strokeDasharray = linkType === 'branch' ? '5,3' : linkType === 'parallel' ? '2,2' : ''
    return style
  }
}

class FlowEdgeView extends PolylineEdge {
  shouldComponentUpdate() {
    return true
  }
}

export function registerCustomEdges(lf) {
  lf.register({
    type: 'flow-edge',
    model: FlowEdgeModel,
    view: FlowEdgeView,
  })
}
