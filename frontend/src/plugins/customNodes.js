import { RectNode, RectNodeModel, h } from '@logicflow/core'

const CATEGORY_COLORS = {
  '调度控制类': { stroke: '#1890ff', fill: '#e6f7ff', header: '#1890ff', label: '#fff' },
  '记忆类': { stroke: '#52c41a', fill: '#f6ffed', header: '#52c41a', label: '#fff' },
  '推理类': { stroke: '#722ed1', fill: '#f9f0ff', header: '#722ed1', label: '#fff' },
  '工具类': { stroke: '#fa8c16', fill: '#fff7e6', header: '#fa8c16', label: '#fff' },
}

class AtomNodeModel extends RectNodeModel {
  setAttributes() {
    const cat = CATEGORY_COLORS[this.properties.category]
    this.stroke = cat?.stroke || '#999'
    this.fill = cat?.fill || '#fafafa'
    this.radius = 8
    this.width = 160
    this.height = 60
    this.strokeWidth = 1.5
  }

  getNodeStyle() {
    const style = super.getNodeStyle()
    style.strokeWidth = 1.5
    if (this.properties._simulating) {
      style.stroke = '#52c41a'
      style.strokeWidth = 3
      style.shadowBlur = 8
      style.shadowColor = 'rgba(82, 196, 26, 0.4)'
    }
    return style
  }

  getTextStyle() {
    const style = super.getTextStyle()
    style.fontSize = 13
    style.color = '#37352f'
    style.fontWeight = 500
    return style
  }

  getAnchorStyle() {
    const style = super.getAnchorStyle()
    style.stroke = '#b0b0ae'
    style.fill = '#fff'
    style.r = 4
    style.hover = { r: 6, fill: '#37352f', stroke: '#37352f' }
    return style
  }
}

class AtomNodeView extends RectNode {
  getShape() {
    const model = this.props.model
    const style = model.getNodeStyle()
    const { x, y, width, height, radius } = model
    const cat = CATEGORY_COLORS[this.props.model.properties.category]
    const headerColor = cat?.header || '#666'
    const catName = this.props.model.properties.category || ''

    const headerH = 18
    const bodyTop = y - height / 2
    const headerCenterY = bodyTop + headerH / 2
    const rx = Math.min(radius || 0, headerH / 2)

    return h('g', null, [
      h('rect', {
        x: x - width / 2,
        y: bodyTop,
        width,
        height,
        rx: radius,
        fill: style.fill,
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
      }),
      h('rect', {
        x: x - width / 2,
        y: bodyTop,
        width,
        height: headerH,
        fill: headerColor,
        rx,
      }),
      h('text', {
        x,
        y: headerCenterY + 1,
        fill: '#fff',
        fontSize: 10,
        fontWeight: 600,
        textAnchor: 'middle',
        dominantBaseline: 'central',
        pointerEvents: 'none',
      }, catName),
    ])
  }
}

class CompositeNodeModel extends RectNodeModel {
  setAttributes() {
    this.stroke = '#37352f'
    this.fill = '#f7f7f5'
    this.radius = 8
    this.width = 200
    this.height = 80
    this.strokeWidth = 2
  }

  getNodeStyle() {
    const style = super.getNodeStyle()
    style.strokeDashArray = '6 3'
    return style
  }

  getTextStyle() {
    const style = super.getTextStyle()
    style.fontSize = 13
    style.color = '#37352f'
    style.fontWeight = 600
    return style
  }

  getAnchorStyle() {
    const style = super.getAnchorStyle()
    style.stroke = '#37352f'
    style.fill = '#fff'
    style.r = 4
    style.hover = { r: 6, fill: '#37352f', stroke: '#37352f' }
    return style
  }
}

export function registerCustomNodes(lf) {
  lf.register({
    type: 'atom-node',
    model: AtomNodeModel,
    view: AtomNodeView,
  })

  lf.register({
    type: 'composite-node',
    model: CompositeNodeModel,
    view: RectNode,
  })
}
