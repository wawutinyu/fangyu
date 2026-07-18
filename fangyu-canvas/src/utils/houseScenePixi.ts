/**
 * 观 · 宅子共场 — 像素图集渲染（nearest，自研 atlas）
 */
import {
  Application,
  Assets,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  TextStyle,
  Texture,
} from 'pixi.js'
import type { HouseSettlement, HouseLayout } from './houseSettlement'
import { HOUSE_PALETTE, haloColor } from './houseSettlement'
import { statusLabel } from './presenceApi'

const ATLAS_URL = '/guan/pixel/atlas.png?v=4'
const ATLAS_JSON_URL = '/guan/pixel/atlas.json?v=4'
const PX = 3 // 像素放大倍数（nearest）

type AtlasJson = {
  tile: number
  frames: Record<string, { x: number; y: number; w: number; h: number }>
  names: Record<string, string>
}

export type HouseSceneHandlers = {
  onSelectActor?: (id: string) => void
  onSelectPath?: (fromHouseId: string, toHouseId: string) => void
}

export type HouseSceneController = {
  update: (settlement: HouseSettlement, selectedId: string | null) => void
  destroy: () => void
  canvas: HTMLCanvasElement
  /** 相对缩放，例如 1.15 / 0.87 */
  zoomBy: (factor: number, centerX?: number, centerY?: number) => void
  resetView: () => void
  getZoom: () => number
  /** 演示：角色出门逛一圈再回来；无人时返回 false */
  demoStroll: () => boolean
}

type TickFx = { update: (t: number) => void }

function hex(css: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(css.trim())
  return m ? parseInt(m[1], 16) : 0x888888
}

function labelStyle(size: number, fill: number, weight: '400' | '700' = '700'): TextStyle {
  return new TextStyle({
    fontFamily: 'ui-rounded, "Nunito", "PingFang SC", "Noto Sans SC", system-ui, sans-serif',
    fontSize: size,
    fontWeight: weight,
    fill,
  })
}

class PixelSheet {
  base: Texture
  json: AtlasJson
  cache = new Map<string, Texture>()

  constructor(base: Texture, json: AtlasJson) {
    this.base = base
    this.json = json
    base.source.scaleMode = 'nearest'
  }

  tex(name: string): Texture {
    const hit = this.cache.get(name)
    if (hit) return hit
    const key = this.json.names[name]
    const fr = key ? this.json.frames[key] : undefined
    if (!fr) return this.base
    const t = new Texture({
      source: this.base.source,
      frame: new Rectangle(fr.x, fr.y, fr.w, fr.h),
    })
    t.source.scaleMode = 'nearest'
    this.cache.set(name, t)
    return t
  }

  sprite(name: string, x: number, y: number, scale = PX): Sprite {
    const s = new Sprite(this.tex(name))
    s.x = Math.round(x)
    s.y = Math.round(y)
    s.scale.set(scale)
    s.roundPixels = true
    return s
  }
}

function fillTiles(
  parent: Container,
  sheet: PixelSheet,
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const tw = sheet.json.tile * PX
  const th = sheet.json.tile * PX
  if (tw <= 0 || th <= 0 || w <= 0 || h <= 0) return
  const cols = Math.min(64, Math.max(1, Math.ceil(w / tw)))
  const rows = Math.min(48, Math.max(1, Math.ceil(h / th)))
  const layer = new Container()
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const sx = x + col * tw
      const sy = y + row * th
      if (sx >= x + w || sy >= y + h) continue
      layer.addChild(sheet.sprite(name, sx, sy))
    }
  }
  parent.addChild(layer)
}

function drawGround(root: Container, sheet: PixelSheet, w: number, h: number, _fx: TickFx[]) {
  // 保底底色（不依赖图集也能看见）
  const bg = new Graphics()
  bg.rect(0, 0, w, h * 0.4).fill({ color: 0x8ec8f0 })
  bg.rect(0, h * 0.35, w, h * 0.65).fill({ color: 0x4caf6a })
  root.addChild(bg)

  fillTiles(root, sheet, 'sky', 0, 0, w, h * 0.38)
  fillTiles(root, sheet, 'grass', 0, h * 0.35, w, h * 0.65)

  root.addChild(sheet.sprite('sun', w * 0.82, h * 0.04, PX * 1.5))
  root.addChild(sheet.sprite('cloud', w * 0.12, h * 0.06, PX * 1.4))
  root.addChild(sheet.sprite('cloud', w * 0.4, h * 0.04, PX))
  root.addChild(sheet.sprite('cloud', w * 0.58, h * 0.1, PX * 1.2))

  const pathY = h * 0.68
  for (let i = 0; i < 18; i++) {
    const px = w * 0.05 + i * (w * 0.05)
    const py = pathY + Math.sin(i * 0.6) * 18
    root.addChild(sheet.sprite('path', px, py, PX))
    if (i % 3 === 0) root.addChild(sheet.sprite('stone', px + 8, py + 20, PX))
  }

  root.addChild(sheet.sprite('tree', w * 0.02, h * 0.42, PX * 1.6))
  root.addChild(sheet.sprite('tree', w * 0.9, h * 0.44, PX * 1.5))
  root.addChild(sheet.sprite('bush', w * 0.18, h * 0.58, PX * 1.2))
  root.addChild(sheet.sprite('bush', w * 0.78, h * 0.62, PX))
  root.addChild(sheet.sprite('lantern', w * 0.15, h * 0.52, PX))
  root.addChild(sheet.sprite('lantern', w * 0.84, h * 0.54, PX))
  root.addChild(sheet.sprite('fence', w * 0.25, h * 0.72, PX))
  root.addChild(sheet.sprite('fence', w * 0.7, h * 0.74, PX))
}

function drawPath(
  root: Container,
  sheet: PixelSheet,
  p: HouseSettlement['paths'][0],
  handlers: HouseSceneHandlers,
  fx: TickFx[],
) {
  const g = new Graphics()
  const mx = (p.x1 + p.x2) / 2
  const my = (p.y1 + p.y2) / 2
  g.moveTo(p.x1, p.y1)
  g.bezierCurveTo(mx, p.y1 - 24, mx, p.y2 + 24, p.x2, p.y2)
  g.stroke({ width: 10, color: hex(HOUSE_PALETTE.path), alpha: 0.9, cap: 'round' })
  g.eventMode = handlers.onSelectPath ? 'static' : 'none'
  g.cursor = handlers.onSelectPath ? 'pointer' : 'default'
  if (handlers.onSelectPath) {
    g.on('pointertap', () => handlers.onSelectPath?.(p.fromHouseId, p.toHouseId))
  }
  root.addChild(g)

  for (let i = 0; i < 5; i++) {
    const u = i / 4
    const x = (1 - u) * (1 - u) * p.x1 + 2 * (1 - u) * u * mx + u * u * p.x2
    const y = (1 - u) * (1 - u) * p.y1 + 2 * (1 - u) * u * ((p.y1 + p.y2) / 2) + u * u * p.y2
    root.addChild(sheet.sprite('stone', x - 8, y - 8, PX * 0.85))
  }

  // 路径光点：复用同一个 Graphics，禁止每帧 new Sprite
  const pulse = new Graphics()
  root.addChild(pulse)
  fx.push({
    update(t) {
      const u = (t * 0.35) % 1
      const x = (1 - u) * (1 - u) * p.x1 + 2 * (1 - u) * u * mx + u * u * p.x2
      const y = (1 - u) * (1 - u) * p.y1 + 2 * (1 - u) * u * ((p.y1 + p.y2) / 2) + u * u * p.y2
      const col = p.hot ? 0xe07a6f : 0x4caf6a
      pulse.clear()
      pulse.circle(x, y - 4, 5).fill({ color: col, alpha: 0.9 })
      pulse.circle(x, y - 4, 10).fill({ color: col, alpha: 0.2 })
    },
  })

  if (p.count != null && p.count > 0) {
    const badge = new Graphics()
      .roundRect(mx - 36, my - 28, 72, 22, 6)
      .fill({ color: 0x2b2622, alpha: 0.75 })
    root.addChild(badge)
    const t = new Text({
      text: `往来×${p.count}`,
      style: labelStyle(11, 0xfff8f0, '700'),
    })
    t.anchor.set(0.5)
    t.x = mx
    t.y = my - 17
    root.addChild(t)
  }
}

function drawHouse(root: Container, sheet: PixelSheet, house: HouseLayout) {
  const { x, y, w, h, hall, court, nooks, name } = house
  const layer = new Container()

  // 宅壳墙
  fillTiles(layer, sheet, 'wall', x, y + 24, w, h - 24)
  // 四角柱
  layer.addChild(sheet.sprite('pillar', x + 4, y + 28, PX))
  layer.addChild(sheet.sprite('pillar', x + w - 28, y + 28, PX))
  layer.addChild(sheet.sprite('pillar', x + 4, y + h - 56, PX))
  layer.addChild(sheet.sprite('pillar', x + w - 28, y + h - 56, PX))
  // 屋顶带
  fillTiles(layer, sheet, 'roof', x - 6, y + 2, w + 12, 30)
  layer.addChild(sheet.sprite('roofRidge', x + w * 0.3, y - 2, PX))
  layer.addChild(sheet.sprite('roofRidge', x + w * 0.48, y - 4, PX * 1.05))
  layer.addChild(sheet.sprite('roofRidge', x + w * 0.66, y - 2, PX))
  layer.addChild(sheet.sprite('door', x + w * 0.5 - 16, y + h - 52, PX))
  layer.addChild(sheet.sprite('gate', x + w * 0.5 - 20, y + h - 20, PX * 0.9))

  // 名牌
  const titleW = Math.min(180, Math.max(100, w * 0.42))
  const titleBg = new Graphics()
    .roundRect(x + 12, y + 34, titleW, house.departmentLabel && house.departmentLabel !== name ? 40 : 26, 4)
    .fill({ color: 0x2b2622, alpha: 0.88 })
    .stroke({ width: 2, color: 0xf5c84c })
  layer.addChild(titleBg)
  const title = new Text({ text: name, style: labelStyle(13, 0xfff8f0, '700') })
  title.x = x + 20
  title.y = y + 39
  layer.addChild(title)
  if (house.departmentLabel && house.departmentLabel !== name) {
    layer.addChild(Object.assign(
      new Text({ text: house.departmentLabel, style: labelStyle(10, 0xf5c84c, '600') }),
      { x: x + 20, y: y + 56 },
    ))
  }

  // 角 — 垫席地板 + 暖色洗
  nooks.forEach((nook, i) => {
    fillTiles(layer, sheet, 'nookFloor', nook.x, nook.y, nook.w, nook.h)
    layer.addChild(new Graphics().rect(nook.x, nook.y, nook.w, nook.h).fill({ color: 0xe07a6f, alpha: 0.08 }))
    layer.addChild(new Graphics().rect(nook.x, nook.y, nook.w, nook.h).stroke({ width: 2, color: 0xc45c55 }))
    layer.addChild(sheet.sprite('futon', nook.x + 4, nook.y + nook.h - 40, PX))
    layer.addChild(sheet.sprite('shelf', nook.x + nook.w - 40, nook.y + 8, PX))
    layer.addChild(sheet.sprite('lantern', nook.x + nook.w - 28, nook.y + 4, PX * 0.85))
    layer.addChild(sheet.sprite('plant', nook.x + 6, nook.y + 8, PX * 0.9))
    layer.addChild(sheet.sprite('markNook', nook.x + 4, nook.y + 2, PX * 0.7))
    const tag = new Text({ text: `角${i + 1}`, style: labelStyle(10, 0xfff8f0, '700') })
    tag.x = nook.x + 28
    tag.y = nook.y + 6
    layer.addChild(tag)
  })

  // 厅 — 暖木地板
  fillTiles(layer, sheet, 'hallFloor', hall.x, hall.y, hall.w, hall.h)
  layer.addChild(new Graphics().rect(hall.x, hall.y, hall.w, hall.h).fill({ color: 0xd4894a, alpha: 0.07 }))
  layer.addChild(new Graphics().rect(hall.x, hall.y, hall.w, hall.h).stroke({ width: 3, color: 0xc47e3b }))
  layer.addChild(sheet.sprite('window', hall.x + hall.w - 48, hall.y + 10, PX))
  layer.addChild(sheet.sprite('table', hall.x + hall.w * 0.5 - 24, hall.y + hall.h * 0.45, PX * 1.25))
  layer.addChild(sheet.sprite('tea', hall.x + hall.w * 0.5 - 16, hall.y + hall.h * 0.38, PX))
  for (let i = 0; i < 4; i++) {
    const ang = (Math.PI / 2) * i + Math.PI / 4
    const cx = hall.x + hall.w * 0.5 + Math.cos(ang) * Math.min(70, hall.w * 0.28)
    const cy = hall.y + hall.h * 0.55 + Math.sin(ang) * Math.min(36, hall.h * 0.22)
    layer.addChild(sheet.sprite('cushion', cx - 16, cy - 8, PX))
  }
  layer.addChild(sheet.sprite('plant', hall.x + 10, hall.y + hall.h - 44, PX))
  layer.addChild(sheet.sprite('markHall', hall.x + 8, hall.y + 8, PX * 0.75))
  layer.addChild(Object.assign(
    new Text({ text: '厅', style: labelStyle(12, 0xfff8f0, '700') }),
    { x: hall.x + 34, y: hall.y + 12 },
  ))

  // 院
  fillTiles(layer, sheet, 'grass', court.x, court.y, court.w, court.h)
  layer.addChild(new Graphics().rect(court.x, court.y, court.w, court.h).fill({ color: 0x4caf6a, alpha: 0.1 }))
  layer.addChild(new Graphics().rect(court.x, court.y, court.w, court.h).stroke({ width: 3, color: 0x3d9a55 }))
  fillTiles(layer, sheet, 'water', court.x + court.w * 0.55, court.y + court.h * 0.35, court.w * 0.35, court.h * 0.4)
  layer.addChild(sheet.sprite('tree', court.x + 4, court.y + 4, PX * 1.1))
  layer.addChild(sheet.sprite('bush', court.x + court.w * 0.35, court.y + 8, PX))
  layer.addChild(sheet.sprite('lantern', court.x + court.w - 36, court.y + 8, PX))
  layer.addChild(sheet.sprite('stone', court.x + court.w * 0.25, court.y + court.h * 0.55, PX))
  layer.addChild(sheet.sprite('stone', court.x + court.w * 0.4, court.y + court.h * 0.65, PX))
  layer.addChild(sheet.sprite('gate', court.x + court.w * 0.72, court.y + court.h - 40, PX * 0.85))
  layer.addChild(sheet.sprite('markCourt', court.x + 8, court.y + 8, PX * 0.75))
  layer.addChild(Object.assign(
    new Text({ text: '院', style: labelStyle(12, 0xfff8f0, '700') }),
    { x: court.x + 34, y: court.y + 12 },
  ))

  // 宅外点缀
  layer.addChild(sheet.sprite('bush', x - 22, y + h * 0.5, PX))
  layer.addChild(sheet.sprite('lantern', x + w + 4, y + 48, PX))
  layer.addChild(sheet.sprite('fence', x + w * 0.15, y + h - 8, PX))

  root.addChild(layer)
}

type ActorView = {
  id: string
  wrap: Container
  bob: Container
  halo: Graphics
  statusText: Text
  phase: number
  busy: boolean
  status: string
  walking: boolean
  fromX: number
  fromY: number
  toX: number
  toY: number
  walkT: number
  walkDur: number
  placeLabel: string
  haloOverride?: string
  /** 演示走位：到达后走回 */
  returnTo?: { x: number; y: number }
}

function setStatusLine(text: Text, line: string, color: number) {
  text.text = line
  try {
    text.style.fill = color
  } catch {
    text.style = labelStyle(9, color, '700')
    text.text = line
  }
}

function placeLabelOf(place: string): string {
  return place === 'hall' ? '在厅' : place === 'court' ? '在院' : '在角'
}

function drawActor(
  root: Container,
  sheet: PixelSheet,
  actor: HouseSettlement['actors'][0],
  selected: boolean,
  handlers: HouseSceneHandlers,
  tickList: ActorView[],
  startAt: { x: number; y: number },
  walking: boolean,
): ActorView {
  const wrap = new Container()
  wrap.x = Math.round(startAt.x)
  wrap.y = Math.round(startAt.y)
  wrap.eventMode = 'static'
  wrap.cursor = 'pointer'
  wrap.on('pointertap', () => handlers.onSelectActor?.(actor.id))

  const haloCol = hex(actor.haloOverride || haloColor(actor.status))
  const halo = new Graphics().circle(0, 6, selected ? 32 : 24).fill({ color: haloCol, alpha: 0.42 })
  wrap.addChild(halo)
  wrap.addChild(new Graphics().circle(0, 0, 36).fill({ color: 0xffffff, alpha: 0.001 }))

  const bob = new Container()
  const idx = Math.abs([...actor.id].reduce((a, c) => a + c.charCodeAt(0), 0)) % 6
  const busy = actor.status === 'busy'
  let spriteName: string
  if (walking) {
    spriteName = `actorWalk${idx % 4}`
  } else if (busy) {
    spriteName = `actorBusy${idx}`
  } else {
    spriteName = `actor${idx}`
  }
  const sp = sheet.sprite(spriteName, -28, -48, PX * 1.85)
  bob.addChild(sp)
  wrap.addChild(bob)

  const placeMark = actor.place === 'hall'
    ? 'markHall'
    : actor.place === 'court'
      ? 'markCourt'
      : 'markNook'
  wrap.addChild(sheet.sprite(placeMark, -46, -8, PX * 0.55))

  const plate = new Graphics()
    .roundRect(-44, 22, 88, 34, 5)
    .fill({ color: 0x1f1a16, alpha: 0.88 })
    .stroke({ width: selected ? 2 : 1, color: selected ? haloCol : 0xf5c84c })
  wrap.addChild(plate)

  const placeLabel = placeLabelOf(actor.place)
  const nameText = new Text({
    text: (actor.label || actor.id).slice(0, 8),
    style: labelStyle(12, 0xfff8f0, '700'),
  })
  nameText.anchor.set(0.5, 0)
  nameText.y = 26
  wrap.addChild(nameText)

  const statusText = new Text({
    text: walking
      ? `${statusLabel(actor.status)} · 在路上`
      : `${statusLabel(actor.status)} · ${placeLabel}`,
    style: labelStyle(10, walking ? 0xf5c84c : haloCol, '700'),
  })
  statusText.anchor.set(0.5, 0)
  statusText.y = 40
  wrap.addChild(statusText)

  if (busy && !walking) {
    const bubble = new Graphics().roundRect(14, -48, 58, 20, 4).fill({ color: 0x2b2622 })
    wrap.addChild(bubble)
    wrap.addChild(Object.assign(
      new Text({ text: '忙着…', style: labelStyle(10, 0xf5c84c, '700') }),
      { x: 22, y: -44 },
    ))
  }

  root.addChild(wrap)

  const dx = actor.x - startAt.x
  const dy = actor.y - startAt.y
  const dist = Math.hypot(dx, dy)
  const walkDur = walking ? Math.min(2.8, Math.max(0.55, dist / 110)) : 0

  const view: ActorView = {
    id: actor.id,
    wrap,
    bob,
    halo,
    statusText,
    phase: Math.random() * Math.PI * 2,
    busy,
    status: String(actor.status),
    walking,
    fromX: startAt.x,
    fromY: startAt.y,
    toX: actor.x,
    toY: actor.y,
    walkT: 0,
    walkDur,
    placeLabel,
    haloOverride: actor.haloOverride,
  }
  tickList.push(view)
  return view
}

export async function mountHouseScene(
  host: HTMLElement,
  settlement: HouseSettlement,
  selectedId: string | null,
  handlers: HouseSceneHandlers = {},
): Promise<HouseSceneController> {
  const app = new Application()
  await app.init({
    width: settlement.width,
    height: settlement.height,
    background: '#8ec8f0',
    antialias: false,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    roundPixels: true,
    preference: 'webgl',
  })
  host.replaceChildren(app.canvas)
  app.canvas.style.width = '100%'
  app.canvas.style.height = '100%'
  app.canvas.style.minHeight = '360px'
  app.canvas.style.display = 'block'
  app.canvas.style.borderRadius = '12px'
  app.canvas.style.imageRendering = 'pixelated'
  app.canvas.style.touchAction = 'none'
  app.canvas.style.background = '#8ec8f0'
  app.canvas.tabIndex = 0

  const boot = new Graphics()
  boot.rect(0, 0, settlement.width, settlement.height).fill({ color: 0x8ec8f0 })
  boot.rect(0, settlement.height * 0.4, settlement.width, settlement.height * 0.6).fill({ color: 0x4caf6a })
  app.stage.addChild(boot)

  // 图集可失败：失败则只用矢量色块 + 占位
  let sheet: PixelSheet
  try {
    const loaded = await Promise.race([
      Promise.all([
        Assets.load<Texture>(ATLAS_URL),
        fetch(ATLAS_JSON_URL).then(async (r) => {
          if (!r.ok) throw new Error(`atlas.json HTTP ${r.status}`)
          const ct = r.headers.get('content-type') || ''
          if (ct.includes('text/html')) throw new Error('atlas.json 路径不对')
          return r.json() as Promise<AtlasJson>
        }),
      ]),
      new Promise<never>((_, rej) => {
        window.setTimeout(() => rej(new Error('atlas 加载超时')), 4000)
      }),
    ])
    const [base, json] = loaded
    if (!base?.source || base.width < 8 || base.height < 8) {
      throw new Error('atlas.png 无效')
    }
    sheet = new PixelSheet(base, json)
  } catch (err) {
    console.warn('[houseScenePixi] atlas fallback', err)
    // 生成纯色 16×16 纹理，保证 sprite 调用不炸
    const mk = (color: number) => {
      const g = new Graphics().rect(0, 0, 16, 16).fill({ color })
      return app.renderer.generateTexture(g)
    }
    const fallbackJson: AtlasJson = {
      tile: 16,
      frames: {},
      names: {},
    }
    const colors: Record<string, number> = {
      grass: 0x4caf6a, grassDark: 0x3d9a55, path: 0xe0c49a, water: 0x4a9ec0,
      floor: 0xe8c9a0, hallFloor: 0xf0d4a8, nookFloor: 0xe6dcc8,
      wall: 0xf5ebe0, roof: 0xe07a6f, roofRidge: 0xc47e3b, pillar: 0x8b5a3c, gate: 0xc47e3b,
      table: 0xc47e3b, cushion: 0xf2a0b5, plant: 0x6fbf7a, lantern: 0xf5c84c,
      shelf: 0x8b5a3c, futon: 0xe07a6f, tree: 0x3d9a55, bush: 0x4caf6a,
      window: 0x8ec8f0, door: 0x8b5a3c, stone: 0xb8aea0, tea: 0x5ba8c9,
      sky: 0x8ec8f0, cloud: 0xffffff, sun: 0xf5c84c, fence: 0x8b5a3c,
      markNook: 0xe07a6f, markHall: 0xd4894a, markCourt: 0x4caf6a,
      actor0: 0xe07a6f, actor1: 0x5ba8c9, actor2: 0xc47e3b, actor3: 0x7fbf6e,
      actor4: 0xc084fc, actor5: 0xf0a05a,
      actorBusy0: 0xe07a6f, actorBusy1: 0x5ba8c9, actorBusy2: 0xc47e3b,
      actorBusy3: 0x7fbf6e, actorBusy4: 0xc084fc, actorBusy5: 0xf0a05a,
      actorWalk0: 0xe07a6f, actorWalk1: 0x5ba8c9, actorWalk2: 0xc47e3b, actorWalk3: 0x7fbf6e,
    }
    const base = mk(0x888888)
    sheet = new PixelSheet(base, fallbackJson)
    for (const [name, color] of Object.entries(colors)) {
      const t = mk(color)
      fallbackJson.names[name] = name
      fallbackJson.frames[name] = { x: 0, y: 0, w: 16, h: 16 }
      sheet.cache.set(name, t)
    }
  }

  const MIN_ZOOM = 0.45
  const MAX_ZOOM = 3.2
  let viewScale = 1

  const viewport = new Container()
  const world = new Container()
  world.eventMode = 'passive'
  viewport.addChild(world)
  app.stage.addChild(viewport)

  // 全屏命中，便于拖拽空白处
  const hitBg = new Graphics()
    .rect(0, 0, settlement.width, settlement.height)
    .fill({ color: 0x000000, alpha: 0.001 })
  hitBg.eventMode = 'static'
  hitBg.cursor = 'grab'
  viewport.addChildAt(hitBg, 0)

  const applyZoomAt = (nextScale: number, cx: number, cy: number) => {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextScale))
    const before = viewScale
    if (Math.abs(clamped - before) < 1e-4) return
    // 保持屏幕点 (cx,cy) 下的世界点不变
    const wx = (cx - viewport.x) / before
    const wy = (cy - viewport.y) / before
    viewScale = clamped
    viewport.scale.set(viewScale)
    viewport.x = cx - wx * viewScale
    viewport.y = cy - wy * viewScale
  }

  const onWheel = (ev: WheelEvent) => {
    ev.preventDefault()
    const rect = app.canvas.getBoundingClientRect()
    const sx = app.canvas.width / rect.width
    const sy = app.canvas.height / rect.height
    const cx = (ev.clientX - rect.left) * (app.renderer.width / rect.width)
    const cy = (ev.clientY - rect.top) * (app.renderer.height / rect.height)
    void sx
    void sy
    const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12
    applyZoomAt(viewScale * factor, cx, cy)
  }
  app.canvas.addEventListener('wheel', onWheel, { passive: false })

  let dragging = false
  let dragMoved = false
  let lastX = 0
  let lastY = 0
  const onPointerDown = (ev: PointerEvent) => {
    // 左键或中键拖拽平移；点角色时子节点会抢事件，这里只处理落在 canvas 空白的情况
    if (ev.button !== 0 && ev.button !== 1) return
    dragging = true
    dragMoved = false
    lastX = ev.clientX
    lastY = ev.clientY
    app.canvas.setPointerCapture(ev.pointerId)
    hitBg.cursor = 'grabbing'
  }
  const onPointerMove = (ev: PointerEvent) => {
    if (!dragging) return
    const dx = ev.clientX - lastX
    const dy = ev.clientY - lastY
    if (!dragMoved && dx * dx + dy * dy < 9) return
    dragMoved = true
    lastX = ev.clientX
    lastY = ev.clientY
    const rect = app.canvas.getBoundingClientRect()
    viewport.x += dx * (app.renderer.width / rect.width)
    viewport.y += dy * (app.renderer.height / rect.height)
  }
  const onPointerUp = (ev: PointerEvent) => {
    dragging = false
    hitBg.cursor = 'grab'
    try {
      app.canvas.releasePointerCapture(ev.pointerId)
    } catch {
      /* ignore */
    }
  }
  app.canvas.addEventListener('pointerdown', onPointerDown)
  app.canvas.addEventListener('pointermove', onPointerMove)
  app.canvas.addEventListener('pointerup', onPointerUp)
  app.canvas.addEventListener('pointercancel', onPointerUp)

  const actorsTick: ActorView[] = []
  const fx: TickFx[] = []
  const lastPos = new Map<string, { x: number; y: number }>()
  /** 进行中的走位（跨 rebuild 续上，避免 Presence 轮询打断演示） */
  const walkPersist = new Map<string, {
    fromX: number
    fromY: number
    toX: number
    toY: number
    walkT: number
    walkDur: number
    returnTo?: { x: number; y: number }
    placeLabel: string
    status: string
  }>()
  let destroyed = false
  let lastDt = 1 / 60
  /** 演示期间暂停用 settlement 目标重算走位 */
  let freezeLayoutUntil = 0

  const rebuild = (s: HouseSettlement, sel: string | null) => {
    for (const a of actorsTick) {
      lastPos.set(a.id, { x: a.wrap.x, y: a.wrap.y })
      if (a.walking) {
        walkPersist.set(a.id, {
          fromX: a.fromX,
          fromY: a.fromY,
          toX: a.toX,
          toY: a.toY,
          walkT: a.walkT,
          walkDur: a.walkDur,
          returnTo: a.returnTo,
          placeLabel: a.placeLabel,
          status: a.status,
        })
      }
    }
    world.removeChildren()
    actorsTick.length = 0
    fx.length = 0
    hitBg.clear().rect(0, 0, s.width, s.height).fill({ color: 0x000000, alpha: 0.001 })
    drawGround(world, sheet, s.width, s.height, fx)
    for (const p of s.paths) drawPath(world, sheet, p, handlers, fx)
    for (const h of s.houses) drawHouse(world, sheet, h)
    for (const a of s.actors) {
      const persisted = walkPersist.get(a.id)
      const prev = lastPos.get(a.id)
      if (persisted) {
        const u = persisted.walkT < 0.5
          ? 2 * persisted.walkT * persisted.walkT
          : 1 - ((-2 * persisted.walkT + 2) ** 2) / 2
        const curX = persisted.fromX + (persisted.toX - persisted.fromX) * u
        const curY = persisted.fromY + (persisted.toY - persisted.fromY) * u
        const targetMoved = Math.hypot(a.x - persisted.toX, a.y - persisted.toY) > 18
        if (targetMoved) {
          // 回放/布局变了：从当前位置改道走向新落点
          const dist = Math.hypot(a.x - curX, a.y - curY)
          const view = drawActor(world, sheet, a, sel === a.id, handlers, actorsTick, { x: curX, y: curY }, dist > 8)
          view.fromX = curX
          view.fromY = curY
          view.toX = a.x
          view.toY = a.y
          view.walkT = 0
          view.walkDur = Math.min(2.2, Math.max(0.45, dist / 120))
          view.returnTo = undefined
          view.placeLabel = placeLabelOf(a.place)
          view.status = a.status
          setStatusLine(view.statusText, `${statusLabel(view.status)} · 在路上`, 0xf5c84c)
        } else {
          const view = drawActor(world, sheet, a, sel === a.id, handlers, actorsTick, { x: curX, y: curY }, true)
          view.fromX = persisted.fromX
          view.fromY = persisted.fromY
          view.toX = persisted.toX
          view.toY = persisted.toY
          view.walkT = persisted.walkT
          view.walkDur = persisted.walkDur
          view.returnTo = persisted.returnTo
          view.placeLabel = persisted.placeLabel
          view.status = persisted.status
          setStatusLine(view.statusText, `${statusLabel(view.status)} · 在路上`, 0xf5c84c)
        }
      } else {
        const dist = prev ? Math.hypot(a.x - prev.x, a.y - prev.y) : 0
        const shouldWalk = !!prev && dist > 18
        const startAt = shouldWalk && prev ? prev : { x: a.x, y: a.y }
        drawActor(world, sheet, a, sel === a.id, handlers, actorsTick, startAt, shouldWalk)
        if (!shouldWalk) lastPos.set(a.id, { x: a.x, y: a.y })
      }
    }
    const alive = new Set(s.actors.map(a => a.id))
    for (const id of [...lastPos.keys()]) {
      if (!alive.has(id)) lastPos.delete(id)
    }
    for (const id of [...walkPersist.keys()]) {
      if (!alive.has(id)) walkPersist.delete(id)
    }
  }

  rebuild(settlement, selectedId)

  app.ticker.add((ticker) => {
    if (destroyed) return
    const dt = Math.min(0.05, ticker.deltaMS / 1000 || lastDt)
    lastDt = dt
    const t = performance.now() / 1000
    for (const a of actorsTick) {
      if (a.walking && a.walkDur > 0) {
        a.walkT = Math.min(1, a.walkT + dt / a.walkDur)
        const u = a.walkT < 0.5
          ? 2 * a.walkT * a.walkT
          : 1 - ((-2 * a.walkT + 2) ** 2) / 2
        a.wrap.x = Math.round(a.fromX + (a.toX - a.fromX) * u)
        a.wrap.y = Math.round(a.fromY + (a.toY - a.fromY) * u)
        a.bob.y = Math.round(Math.sin(t * 10 + a.phase) * 2)
        a.bob.rotation = Math.sin(t * 10 + a.phase) * 0.05
        walkPersist.set(a.id, {
          fromX: a.fromX,
          fromY: a.fromY,
          toX: a.toX,
          toY: a.toY,
          walkT: a.walkT,
          walkDur: a.walkDur,
          returnTo: a.returnTo,
          placeLabel: a.placeLabel,
          status: a.status,
        })
        if (a.walkT >= 1) {
          a.wrap.x = Math.round(a.toX)
          a.wrap.y = Math.round(a.toY)
          a.bob.rotation = 0
          if (a.returnTo) {
            const back = a.returnTo
            a.returnTo = undefined
            a.fromX = a.toX
            a.fromY = a.toY
            a.toX = back.x
            a.toY = back.y
            a.walkT = 0
            a.walkDur = Math.min(2.8, Math.max(0.55, Math.hypot(a.toX - a.fromX, a.toY - a.fromY) / 110))
            a.walking = true
            setStatusLine(a.statusText, `${statusLabel(a.status)} · 在路上`, 0xf5c84c)
          } else {
            a.walking = false
            walkPersist.delete(a.id)
            setStatusLine(a.statusText, `${statusLabel(a.status)} · ${a.placeLabel}`, hex(a.haloOverride || haloColor(a.status)))
            lastPos.set(a.id, { x: a.toX, y: a.toY })
          }
        }
      } else {
        const amp = a.busy ? 2 : 1
        a.bob.y = Math.round(Math.sin(t * (a.busy ? 5 : 2.2) + a.phase) * amp)
        a.bob.rotation = 0
      }
      a.halo.alpha = 0.3 + 0.25 * (0.5 + 0.5 * Math.sin(t * 2 + a.phase))
    }
    for (const f of fx) f.update(t)
  })

  return {
    canvas: app.canvas,
    zoomBy(factor, centerX, centerY) {
      const cx = centerX ?? app.renderer.width / 2
      const cy = centerY ?? app.renderer.height / 2
      applyZoomAt(viewScale * factor, cx, cy)
    },
    resetView() {
      viewScale = 1
      viewport.scale.set(1)
      viewport.x = 0
      viewport.y = 0
    },
    getZoom: () => viewScale,
    demoStroll() {
      if (actorsTick.length === 0) return false
      freezeLayoutUntil = performance.now() + 5000
      let i = 0
      for (const a of actorsTick) {
        if (a.walking && a.returnTo) continue
        const ox = a.wrap.x
        const oy = a.wrap.y
        const ang = (i / Math.max(actorsTick.length, 1)) * Math.PI * 2 + 0.4
        const dist = 56 + (i % 3) * 20
        a.fromX = ox
        a.fromY = oy
        a.toX = Math.round(ox + Math.cos(ang) * dist)
        a.toY = Math.round(oy + Math.sin(ang) * dist)
        a.walkT = 0
        a.walkDur = Math.min(2.4, Math.max(0.7, dist / 95))
        a.walking = true
        a.returnTo = { x: ox, y: oy }
        setStatusLine(a.statusText, `${statusLabel(a.status)} · 在路上`, 0xf5c84c)
        walkPersist.set(a.id, {
          fromX: a.fromX,
          fromY: a.fromY,
          toX: a.toX,
          toY: a.toY,
          walkT: 0,
          walkDur: a.walkDur,
          returnTo: a.returnTo,
          placeLabel: a.placeLabel,
          status: a.status,
        })
        i += 1
      }
      return i > 0
    },
    update(next, sel) {
      if (destroyed) return
      if (app.renderer.width !== next.width || app.renderer.height !== next.height) {
        app.renderer.resize(next.width, next.height)
      }
      // 演示走位期间：跳过重建，避免 Presence 轮询打断
      if (performance.now() < freezeLayoutUntil && actorsTick.some(a => a.walking)) {
        return
      }
      rebuild(next, sel)
    },
    destroy() {
      destroyed = true
      app.canvas.removeEventListener('wheel', onWheel)
      app.canvas.removeEventListener('pointerdown', onPointerDown)
      app.canvas.removeEventListener('pointermove', onPointerMove)
      app.canvas.removeEventListener('pointerup', onPointerUp)
      app.canvas.removeEventListener('pointercancel', onPointerUp)
      app.destroy(true, { children: true })
    },
  }
}
