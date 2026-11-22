import { forceCenter, forceLink, forceManyBody, forceSimulation } from 'd3-force-3d'
import type { Link, Note } from '@shared/types'
import { C } from '@shared/constants'
import { fibonacciSphere } from './math'

export type Vec3 = [number, number, number]

interface LayoutNode {
  gid: string
  x: number
  y: number
  z: number
  fixed: boolean
  fx?: number
  fy?: number
  fz?: number
  index?: number
}

function hasPos(n: Note): boolean {
  return (
    Array.isArray(n.pos) &&
    n.pos.length === 3 &&
    n.pos.every((v) => typeof v === 'number' && Number.isFinite(v)) &&
    (n.pos[0] !== 0 || n.pos[1] !== 0 || n.pos[2] !== 0)
  )
}

/**
 * 力导向布局只在启动时跑一次，跑完冻结（规格书 §7.2）。
 *
 * 与规格书的一处有意收敛：**已经有 pos 的节点被固定住**（fx/fy/fz），
 * 只有位置为空/零的新节点参与布局。否则每次启动都会重新收敛，
 * A4「重启后星球位置不变」就不成立了。
 */
export function layoutNotes(notes: Note[], links: Link[]): Map<string, Vec3> {
  const result = new Map<string, Vec3>()
  if (notes.length === 0) return result

  const nodes: LayoutNode[] = notes.map((n, i) => {
    if (hasPos(n)) {
      return { gid: n.gid, x: n.pos[0], y: n.pos[1], z: n.pos[2], fixed: true }
    }
    const [x, y, z] = fibonacciSphere(i, notes.length, C.INITIAL_SPHERE_RADIUS)
    return { gid: n.gid, x, y, z, fixed: false }
  })

  const freeCount = nodes.filter((n) => !n.fixed).length
  if (freeCount === 0 || notes.length === 1) {
    for (const n of nodes) result.set(n.gid, [n.x, n.y, n.z])
    return result
  }

  for (const n of nodes) {
    if (n.fixed) {
      n.fx = n.x
      n.fy = n.y
      n.fz = n.z
    }
  }

  const known = new Set(nodes.map((n) => n.gid))
  const simLinks = links
    .filter((l) => known.has(l.a) && known.has(l.b))
    .map((l) => ({ source: l.a, target: l.b }))

  const sim = forceSimulation(nodes as never, 3)
    .force('charge', forceManyBody().strength(-30))
    .force(
      'link',
      forceLink(simLinks as never)
        .id((d: never) => (d as LayoutNode).gid)
        .distance(20)
        .strength(0.3)
    )
    .force('center', forceCenter(0, 0, 0).strength(0.05))
    .stop()

  for (let i = 0; i < C.FORCE_TICKS; i++) sim.tick()

  for (const n of nodes) {
    result.set(n.gid, [n.x ?? 0, n.y ?? 0, n.z ?? 0])
  }
  return result
}

/**
 * 二次贝塞尔曲线。控制点 = 中点沿「屏面法线」偏移 0.25 × 距离（规格书 §7.5），
 * perp 由调用方按相机视线算出来，这样曲线在屏幕上总是明显弯的、多条线也不会叠成直线；
 * 不传 perp 时退回世界空间里的任意垂直方向。
 */
export function bezierPoints(
  a: Vec3,
  b: Vec3,
  perp?: Vec3,
  segments = 28
): { points: Vec3[]; control: Vec3 } {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const dz = b[2] - a[2]
  const dist = Math.hypot(dx, dy, dz) || 1
  const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]

  let px = 0
  let py = 0
  let pz = 0
  if (perp) {
    px = perp[0]
    py = perp[1]
    pz = perp[2]
  }
  const plen = Math.hypot(px, py, pz)
  if (plen < 0.08) {
    // 任取一个不与 AB 平行的方向做叉乘，得到垂直方向
    const ref: Vec3 = Math.abs(dy) < dist * 0.9 ? [0, 1, 0] : [1, 0, 0]
    px = dy * ref[2] - dz * ref[1]
    py = dz * ref[0] - dx * ref[2]
    pz = dx * ref[1] - dy * ref[0]
    const len = Math.hypot(px, py, pz) || 1
    px /= len
    py /= len
    pz /= len
  } else {
    px /= plen
    py /= plen
    pz /= plen
  }

  const offset = dist * 0.25
  const control: Vec3 = [mid[0] + px * offset, mid[1] + py * offset, mid[2] + pz * offset]

  const points: Vec3[] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const u = 1 - t
    points.push([
      u * u * a[0] + 2 * u * t * control[0] + t * t * b[0],
      u * u * a[1] + 2 * u * t * control[1] + t * t * b[1],
      u * u * a[2] + 2 * u * t * control[2] + t * t * b[2]
    ])
  }
  return { points, control }
}

export function pointOnBezier(a: Vec3, control: Vec3, b: Vec3, t: number): Vec3 {
  const u = 1 - t
  return [
    u * u * a[0] + 2 * u * t * control[0] + t * t * b[0],
    u * u * a[1] + 2 * u * t * control[1] + t * t * b[1],
    u * u * a[2] + 2 * u * t * control[2] + t * t * b[2]
  ]
}
