/**
 * 生成观 · 宅子共场像素图集（自研、可商用）
 * 运行: npm run gen:guan-pixel
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDirs = [
  path.resolve(__dirname, '../public/guan/pixel'),
  path.resolve(__dirname, '../../fangyu-studio/public/guan/pixel'),
]
for (const outDir of outDirs) fs.mkdirSync(outDir, { recursive: true })

const TILE = 16

function hex(c) {
  if (c.length === 7) {
    return [
      parseInt(c.slice(1, 3), 16),
      parseInt(c.slice(3, 5), 16),
      parseInt(c.slice(5, 7), 16),
      255,
    ]
  }
  if (c.length === 9) {
    return [
      parseInt(c.slice(1, 3), 16),
      parseInt(c.slice(3, 5), 16),
      parseInt(c.slice(5, 7), 16),
      parseInt(c.slice(7, 9), 16),
    ]
  }
  return [0, 0, 0, 0]
}

function makePng(w, h) {
  const png = new PNG({ width: w, height: h, filterType: 4 })
  png.data.fill(0)
  return png
}

function set(png, x, y, color) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return
  const [r, g, b, a] = typeof color === 'string' ? hex(color) : color
  const i = (png.width * y + x) << 2
  png.data[i] = r
  png.data[i + 1] = g
  png.data[i + 2] = b
  png.data[i + 3] = a
}

function fill(png, x, y, w, h, color) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) set(png, xx, yy, color)
  }
}

function rect(png, x, y, w, h, color) {
  for (let xx = x; xx < x + w; xx++) {
    set(png, xx, y, color)
    set(png, xx, y + h - 1, color)
  }
  for (let yy = y; yy < y + h; yy++) {
    set(png, x, yy, color)
    set(png, x + w - 1, yy, color)
  }
}

function write(png, name) {
  const buf = PNG.sync.write(png)
  for (const outDir of outDirs) {
    const fp = path.join(outDir, name)
    fs.writeFileSync(fp, buf)
    console.log('wrote', fp, png.width + 'x' + png.height)
  }
}

const COLS = 12
const ROWS = 10
const atlas = makePng(COLS * TILE, ROWS * TILE)
const frames = {}

function blitTile(col, row, draw) {
  const ox = col * TILE
  const oy = row * TILE
  const tile = makePng(TILE, TILE)
  draw(tile)
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const i = (TILE * y + x) << 2
      if (tile.data[i + 3] === 0) continue
      set(atlas, ox + x, oy + y, [
        tile.data[i],
        tile.data[i + 1],
        tile.data[i + 2],
        tile.data[i + 3],
      ])
    }
  }
  const key = `${col}_${row}`
  frames[key] = { x: ox, y: oy, w: TILE, h: TILE }
  return key
}

const C = {
  ink: '#1f1a16',
  outline: '#2b2622',
  grass: '#5bb86f',
  grass2: '#3d9a55',
  grass3: '#7fca88',
  dirt: '#c4a574',
  path: '#e8d2a8',
  pathEdge: '#b8956a',
  wall: '#fff4e8',
  wall2: '#e8d5c0',
  wallEdge: '#c9a882',
  wood: '#d4894a',
  wood2: '#8b5a3c',
  roof: '#e07a6f',
  roof2: '#c45c55',
  roof3: '#a84842',
  floor: '#e8c9a0',
  floor2: '#d4a574',
  hallFloor: '#f0d4a8',
  hallFloor2: '#dcb87a',
  nookFloor: '#e6dcc8',
  nookFloor2: '#cfc3a8',
  water: '#4a9ec0',
  water2: '#8ed0ea',
  bloom: '#f2a0b5',
  bloom2: '#f5c84c',
  skin: '#f3d7bc',
  white: '#fff8f0',
  shadow: '#00000055',
}

// —— 地面 / 结构 ——
blitTile(0, 0, (t) => {
  fill(t, 0, 0, 16, 16, C.grass)
  for (let i = 0; i < 14; i++) set(t, (i * 3 + 1) % 16, (i * 5) % 16, C.grass2)
  set(t, 3, 4, C.bloom)
  set(t, 12, 9, C.bloom2)
  set(t, 8, 12, C.grass3)
})
blitTile(1, 0, (t) => {
  fill(t, 0, 0, 16, 16, C.grass2)
  for (let i = 0; i < 10; i++) set(t, (i * 4) % 16, (i * 7) % 16, C.grass)
})
blitTile(2, 0, (t) => {
  fill(t, 0, 0, 16, 16, C.pathEdge)
  fill(t, 1, 1, 14, 14, C.path)
  for (let i = 0; i < 6; i++) set(t, 3 + i * 2, 4 + (i % 3), C.dirt)
})
blitTile(3, 0, (t) => {
  fill(t, 0, 0, 16, 16, C.water)
  fill(t, 2, 3, 6, 2, C.water2)
  fill(t, 8, 9, 5, 2, C.water2)
  set(t, 5, 7, C.white)
})
blitTile(4, 0, (t) => {
  fill(t, 0, 0, 16, 16, C.floor)
  for (let y = 0; y < 16; y += 4) fill(t, 0, y, 16, 1, C.floor2)
  rect(t, 0, 0, 16, 16, C.wood2)
})
blitTile(5, 0, (t) => {
  fill(t, 0, 0, 16, 16, C.wall)
  fill(t, 0, 13, 16, 3, C.wall2)
  for (let x = 2; x < 16; x += 5) fill(t, x, 2, 1, 11, C.wallEdge)
  rect(t, 0, 0, 16, 16, C.wood2)
})
blitTile(6, 0, (t) => {
  fill(t, 0, 0, 16, 16, C.roof)
  for (let y = 2; y < 16; y += 3) fill(t, 0, y, 16, 1, C.roof2)
  fill(t, 0, 0, 16, 2, C.roof3)
})
blitTile(7, 0, (t) => {
  fill(t, 0, 5, 16, 3, C.wood)
  fill(t, 0, 0, 16, 5, C.roof)
  fill(t, 0, 8, 16, 8, C.roof2)
  fill(t, 0, 8, 16, 1, C.roof3)
})
// hall floor — warmer
blitTile(8, 0, (t) => {
  fill(t, 0, 0, 16, 16, C.hallFloor)
  for (let y = 1; y < 16; y += 5) fill(t, 0, y, 16, 1, C.hallFloor2)
  for (let x = 3; x < 16; x += 7) fill(t, x, 0, 1, 16, '#e0c090')
  rect(t, 0, 0, 16, 16, C.wood)
})
// nook floor — soft mat
blitTile(9, 0, (t) => {
  fill(t, 0, 0, 16, 16, C.nookFloor)
  fill(t, 1, 1, 14, 14, C.nookFloor2)
  fill(t, 2, 2, 12, 12, C.nookFloor)
  for (let y = 4; y < 14; y += 4) fill(t, 2, y, 12, 1, C.nookFloor2)
  rect(t, 0, 0, 16, 16, C.wallEdge)
})
// pillar
blitTile(10, 0, (t) => {
  fill(t, 5, 0, 6, 16, C.wood2)
  fill(t, 6, 0, 4, 16, C.wood)
  fill(t, 4, 0, 8, 2, C.wood2)
  fill(t, 4, 14, 8, 2, C.wood2)
})
// gate / courtyard arch hint
blitTile(11, 0, (t) => {
  fill(t, 1, 2, 14, 3, C.wood2)
  fill(t, 2, 1, 12, 2, C.wood)
  fill(t, 2, 5, 3, 11, C.wood2)
  fill(t, 11, 5, 3, 11, C.wood2)
  fill(t, 5, 8, 6, 2, C.bloom2)
})

// —— 家具 ——
blitTile(0, 1, (t) => {
  fill(t, 1, 5, 14, 7, C.wood2)
  fill(t, 2, 4, 12, 3, C.wood)
  fill(t, 2, 12, 2, 3, C.wood2)
  fill(t, 12, 12, 2, 3, C.wood2)
  rect(t, 1, 4, 14, 8, C.outline)
})
blitTile(1, 1, (t) => {
  fill(t, 2, 5, 12, 8, C.bloom)
  fill(t, 3, 6, 10, 6, C.white)
  rect(t, 2, 5, 12, 8, C.outline)
})
blitTile(2, 1, (t) => {
  fill(t, 6, 10, 4, 5, C.wood)
  fill(t, 4, 3, 8, 8, C.grass2)
  fill(t, 5, 2, 6, 6, C.grass3)
  set(t, 6, 4, C.bloom)
  set(t, 10, 5, C.bloom2)
  rect(t, 6, 10, 4, 5, C.outline)
})
blitTile(3, 1, (t) => {
  fill(t, 7, 0, 2, 3, C.wood2)
  fill(t, 4, 3, 8, 9, C.roof)
  fill(t, 5, 4, 6, 7, C.bloom2)
  fill(t, 6, 5, 4, 5, '#fff1a8')
  fill(t, 7, 12, 2, 4, C.wood2)
  rect(t, 4, 3, 8, 9, C.outline)
})
blitTile(4, 1, (t) => {
  fill(t, 2, 1, 12, 14, C.wood2)
  fill(t, 3, 2, 10, 3, '#5ba8c9')
  fill(t, 3, 6, 10, 3, C.bloom)
  fill(t, 3, 10, 10, 3, C.bloom2)
  rect(t, 2, 1, 12, 14, C.outline)
})
blitTile(5, 1, (t) => {
  fill(t, 1, 7, 14, 7, '#c45c55')
  fill(t, 2, 8, 12, 5, '#e07a6f')
  fill(t, 2, 4, 6, 4, C.white)
  rect(t, 1, 7, 14, 7, C.outline)
})
blitTile(6, 1, (t) => {
  fill(t, 7, 9, 2, 7, C.wood2)
  fill(t, 2, 2, 12, 10, C.grass2)
  fill(t, 4, 1, 8, 8, C.grass3)
  fill(t, 5, 3, 6, 5, C.grass)
  set(t, 5, 4, C.bloom)
  set(t, 11, 6, C.bloom2)
  rect(t, 2, 2, 12, 10, C.outline)
})
blitTile(7, 1, (t) => {
  fill(t, 1, 6, 14, 9, C.grass2)
  fill(t, 3, 4, 10, 8, C.grass3)
  set(t, 5, 7, C.bloom)
  set(t, 11, 9, C.bloom2)
  rect(t, 1, 6, 14, 9, C.outline)
})
blitTile(8, 1, (t) => {
  fill(t, 1, 1, 14, 14, C.wood2)
  fill(t, 2, 2, 5, 5, '#8ec8f0')
  fill(t, 9, 2, 5, 5, '#b8dff5')
  fill(t, 2, 9, 5, 5, '#8ec8f0')
  fill(t, 9, 9, 5, 5, '#b8dff5')
  fill(t, 7, 1, 2, 14, C.wood)
  fill(t, 1, 7, 14, 2, C.wood)
  rect(t, 1, 1, 14, 14, C.outline)
})
blitTile(9, 1, (t) => {
  fill(t, 2, 0, 12, 16, C.wood2)
  fill(t, 3, 1, 10, 14, C.wood)
  for (let y = 2; y < 14; y += 3) fill(t, 3, y, 10, 1, C.wood2)
  set(t, 11, 8, C.bloom2)
  rect(t, 2, 0, 12, 16, C.outline)
})
blitTile(10, 1, (t) => {
  fill(t, 2, 5, 12, 8, '#9a9084')
  fill(t, 3, 6, 10, 6, '#d4ccc0')
  set(t, 5, 8, '#fff8f0')
  rect(t, 2, 5, 12, 8, C.outline)
})
blitTile(11, 1, (t) => {
  fill(t, 3, 6, 10, 6, C.wood)
  fill(t, 4, 4, 4, 4, '#5ba8c9')
  fill(t, 9, 4, 4, 4, C.roof)
  set(t, 5, 5, C.white)
  rect(t, 3, 6, 10, 6, C.outline)
})

// —— 角色：描边小人 ——
const PALETTES = [
  { body: '#e07a6f', hair: '#5a3d2e', accent: '#f5c84c' },
  { body: '#4a9ec0', hair: '#2f5f73', accent: '#8ed0ea' },
  { body: '#c47e3b', hair: '#5a3d2e', accent: '#f0d4a8' },
  { body: '#5faf6a', hair: '#2f5a34', accent: '#b6e0b0' },
  { body: '#b07ad4', hair: '#4a2f6a', accent: '#e0c4f5' },
  { body: '#e09050', hair: '#5a3d2e', accent: '#ffe0b0' },
]

function outlineBlob(t, cells, color) {
  const set_ = new Set(cells.map(([x, y]) => `${x},${y}`))
  for (const [x, y] of cells) {
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = x + dx
      const ny = y + dy
      if (!set_.has(`${nx},${ny}`)) set(t, nx, ny, color)
    }
  }
}

function drawChar(t, pal, opts = {}) {
  const { armUp = false, step = 0 } = opts
  // shadow
  fill(t, 4, 14, 8, 2, C.shadow)

  const legY = 11 + (step ? 1 : 0)
  const legCells = [
    [5, legY], [6, legY], [5, legY + 1], [6, legY + 1], [5, legY + 2],
    [9, legY - (step ? 1 : 0)], [10, legY - (step ? 1 : 0)],
    [9, legY + 1 - (step ? 1 : 0)], [10, legY + 1 - (step ? 1 : 0)],
    [10, legY + 2 - (step ? 1 : 0)],
  ]
  const bodyCells = []
  for (let y = 6; y <= 11; y++) for (let x = 4; x <= 11; x++) bodyCells.push([x, y])
  const headCells = []
  for (let y = 2; y <= 6; y++) for (let x = 5; x <= 10; x++) headCells.push([x, y])
  const hairCells = []
  for (let y = 1; y <= 3; y++) for (let x = 4; x <= 11; x++) hairCells.push([x, y])
  const armL = [[2, 7], [3, 7], [2, 8], [3, 8], [2, 9], [3, 9]]
  const armR = armUp
    ? [[12, 3], [13, 3], [12, 4], [13, 4], [12, 5], [13, 5], [12, 6], [13, 6]]
    : [[12, 7], [13, 7], [12, 8], [13, 8], [12, 9], [13, 9]]

  const all = [...legCells, ...bodyCells, ...headCells, ...hairCells, ...armL, ...armR]
  outlineBlob(t, all, C.outline)

  for (const [x, y] of legCells) set(t, x, y, '#4a433c')
  for (const [x, y] of bodyCells) set(t, x, y, pal.body)
  fill(t, 5, 7, 6, 2, pal.accent)
  for (const [x, y] of headCells) set(t, x, y, C.skin)
  for (const [x, y] of hairCells) set(t, x, y, pal.hair)
  set(t, 6, 4, C.ink)
  set(t, 9, 4, C.ink)
  set(t, 7, 6, '#e07a6f')
  for (const [x, y] of armL) set(t, x, y, pal.body)
  for (const [x, y] of armR) set(t, x, y, pal.body)
}

for (let i = 0; i < 6; i++) {
  blitTile(i, 2, (t) => drawChar(t, PALETTES[i]))
}
for (let i = 0; i < 6; i++) {
  blitTile(i, 3, (t) => drawChar(t, PALETTES[i], { armUp: true }))
}
// walk frames
blitTile(6, 2, (t) => drawChar(t, PALETTES[0], { step: 1 }))
blitTile(7, 2, (t) => drawChar(t, PALETTES[1], { step: 1 }))
blitTile(8, 2, (t) => drawChar(t, PALETTES[2], { step: 1 }))
blitTile(9, 2, (t) => drawChar(t, PALETTES[3], { step: 1 }))

// sky accents
blitTile(6, 3, (t) => { fill(t, 0, 0, 16, 16, '#9ad0f0') })
blitTile(7, 3, (t) => {
  fill(t, 1, 6, 14, 5, C.white)
  fill(t, 3, 4, 10, 4, C.white)
  fill(t, 5, 3, 6, 3, '#f7fbff')
})
blitTile(8, 3, (t) => {
  fill(t, 3, 3, 10, 10, C.bloom2)
  fill(t, 5, 5, 6, 6, '#fff1a8')
  set(t, 8, 8, C.white)
  outlineBlob(t, (() => {
    const c = []
    for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) c.push([x, y])
    return c
  })(), C.outline)
})
blitTile(9, 3, (t) => {
  for (let x = 1; x < 16; x += 4) fill(t, x, 3, 2, 12, C.wood2)
  fill(t, 0, 6, 16, 2, C.wood)
  rect(t, 0, 6, 16, 2, C.outline)
})
// zone markers 角/厅/院 color chips
blitTile(10, 3, (t) => {
  fill(t, 2, 2, 12, 12, '#e07a6f')
  fill(t, 4, 4, 8, 8, '#f0a090')
  rect(t, 2, 2, 12, 12, C.outline)
})
blitTile(11, 3, (t) => {
  fill(t, 2, 2, 12, 12, '#d4894a')
  fill(t, 4, 4, 8, 8, '#f0d4a8')
  rect(t, 2, 2, 12, 12, C.outline)
})
blitTile(0, 4, (t) => {
  fill(t, 2, 2, 12, 12, '#4caf6a')
  fill(t, 4, 4, 8, 8, '#8fd19a')
  rect(t, 2, 2, 12, 12, C.outline)
})

const names = {
  grass: '0_0',
  grassDark: '1_0',
  path: '2_0',
  water: '3_0',
  floor: '4_0',
  wall: '5_0',
  roof: '6_0',
  roofRidge: '7_0',
  hallFloor: '8_0',
  nookFloor: '9_0',
  pillar: '10_0',
  gate: '11_0',
  table: '0_1',
  cushion: '1_1',
  plant: '2_1',
  lantern: '3_1',
  shelf: '4_1',
  futon: '5_1',
  tree: '6_1',
  bush: '7_1',
  window: '8_1',
  door: '9_1',
  stone: '10_1',
  tea: '11_1',
  actor0: '0_2',
  actor1: '1_2',
  actor2: '2_2',
  actor3: '3_2',
  actor4: '4_2',
  actor5: '5_2',
  actorWalk0: '6_2',
  actorWalk1: '7_2',
  actorWalk2: '8_2',
  actorWalk3: '9_2',
  actorBusy0: '0_3',
  actorBusy1: '1_3',
  actorBusy2: '2_3',
  actorBusy3: '3_3',
  actorBusy4: '4_3',
  actorBusy5: '5_3',
  sky: '6_3',
  cloud: '7_3',
  sun: '8_3',
  fence: '9_3',
  markNook: '10_3',
  markHall: '11_3',
  markCourt: '0_4',
}

write(atlas, 'atlas.png')
const meta = JSON.stringify({ tile: TILE, cols: COLS, rows: ROWS, frames, names, version: 4 }, null, 2)
for (const outDir of outDirs) {
  fs.writeFileSync(path.join(outDir, 'atlas.json'), meta)
  console.log('atlas.json ready →', outDir)
}
