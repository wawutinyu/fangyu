import type { EdgeProps } from 'reactflow'

const STYLES: Record<string, { stroke: string; strokeDasharray: string }> = {
  serial: { stroke: '#37352f', strokeDasharray: '' },
  branch: { stroke: '#fa8c16', strokeDasharray: '6 3' },
  parallel: { stroke: '#722ed1', strokeDasharray: '2 4' },
}

export default function FlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const linkType = ((data?.linkType as string) || 'serial') as keyof typeof STYLES
  const style = STYLES[linkType] || STYLES.serial

  const edgePath = getBezierPath(sourceX, sourceY, sourcePosition!, targetX, targetY, targetPosition!)

  return (
    <>
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={15}
        style={{ cursor: 'pointer' }}
      />
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={style.stroke}
        strokeWidth={selected ? 2.5 : 1.5}
        strokeDasharray={style.strokeDasharray}
        style={{ cursor: 'pointer' }}
      />
      {selected && (
        <path
          d={edgePath}
          fill="none"
          stroke={style.stroke}
          strokeWidth={6}
          strokeDasharray={style.strokeDasharray}
          strokeOpacity={0.2}
          style={{ cursor: 'pointer', pointerEvents: 'none' }}
        />
      )}
    </>
  )
}

function getBezierPath(
  sourceX: number,
  sourceY: number,
  sourcePosition: string,
  targetX: number,
  targetY: number,
  targetPosition: string,
) {
  const sourceDir = positionToDir(sourcePosition)
  const targetDir = positionToDir(targetPosition)
  const dist = Math.abs(targetX - sourceX) + Math.abs(targetY - sourceY)
  const offset = Math.max(50, dist * 0.4)

  const sx = sourceX + sourceDir.x * offset
  const sy = sourceY + sourceDir.y * offset
  const tx = targetX + targetDir.x * offset
  const ty = targetY + targetDir.y * offset

  return `M${sourceX},${sourceY} C${sx},${sy} ${tx},${ty} ${targetX},${targetY}`
}

function positionToDir(pos: string) {
  switch (pos) {
    case 'top': return { x: 0, y: -1 }
    case 'bottom': return { x: 0, y: 1 }
    case 'left': return { x: -1, y: 0 }
    case 'right': return { x: 1, y: 0 }
    default: return { x: 0, y: 0 }
  }
}
