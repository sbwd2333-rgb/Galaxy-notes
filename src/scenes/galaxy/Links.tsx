import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import type { Link } from '@shared/types'
import { C } from '@shared/constants'
import { bezierPoints, pointOnBezier, type Vec3 } from '../../lib/layout'
import { hash32 } from '../../lib/math'
import { getLabelTexture } from './PlanetTexture'

interface LinksProps {
  links: Link[]
  positions: Record<string, Vec3>
  hoveredPlanet: string | null
  hoveredLink: string | null
  selection: string[]
  onHoverLink: (id: string | null) => void
}

function LinkCurve({
  link,
  a,
  b,
  highlighted,
  showLabel,
  onHoverLink
}: {
  link: Link
  a: Vec3
  b: Vec3
  highlighted: boolean
  showLabel: boolean
  onHoverLink: (id: string | null) => void
}): JSX.Element {
  const camera = useThree((s) => s.camera)
  const { points, control } = useMemo(() => {
    let perp: Vec3 | undefined
    {
      const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2])
      const view = new THREE.Vector3()
      camera.getWorldDirection(view)
      const n = new THREE.Vector3().crossVectors(ab, view)
      if (n.lengthSq() > 1e-6) {
        n.normalize()
        // 按 link id 定方向，避免所有连线朝同一侧弯
        const sign = hash32(link.id) % 2 === 0 ? 1 : -1
        perp = [n.x * sign, n.y * sign, n.z * sign]
      }
    }
    return bezierPoints(a, b, perp)
    // 曲线一旦建立就固定在世界里，不随相机旋转而变形
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, b, link.id])

  // 生长动画：只有刚建立（<2s）的连线才播放，避免重启时全屏乱长
  const isNew = useMemo(() => {
    const created = Date.parse(link.created)
    return Number.isFinite(created) && Date.now() - created < 2000
  }, [link.created])

  const [progress, setProgress] = useState(isNew ? 0 : 1)

  useEffect(() => {
    if (!isNew) return
    let raf = 0
    const start = performance.now()
    const tick = (): void => {
      const t = Math.min(1, (performance.now() - start) / C.LINK_GROW_MS)
      setProgress(t)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isNew])

  const visiblePoints = useMemo(() => {
    const n = Math.max(2, Math.round(points.length * progress))
    return progress >= 1 ? points : points.slice(0, n)
  }, [points, progress])

  const opacity = highlighted ? 0.75 : 0.18
  const lineWidth = highlighted ? 2 : 1.2

  return (
    <group>
      <Line
        points={visiblePoints}
        color="#ffffff"
        lineWidth={lineWidth}
        transparent
        opacity={opacity}
        depthWrite={false}
        onPointerOver={(e) => {
          e.stopPropagation()
          onHoverLink(link.id)
        }}
        onPointerOut={(e) => {
          e.stopPropagation()
          onHoverLink(null)
        }}
      />
      {link.label.trim() !== '' && showLabel && progress >= 1 && (
        <LinkLabel label={link.label} position={pointOnBezier(a, control, b, 0.5)} />
      )}
    </group>
  )
}

function LinkLabel({ label, position }: { label: string; position: Vec3 }): JSX.Element {
  const { texture, aspect } = useMemo(() => getLabelTexture(label), [label])
  const ref = useRef<THREE.Sprite>(null)
  const height = 1.5

  useFrame((_, delta) => {
    const s = ref.current
    if (!s) return
    const mat = s.material as THREE.SpriteMaterial
    mat.opacity = THREE.MathUtils.damp(mat.opacity, 1, 12, Math.min(delta, 0.05))
  })

  return (
    <sprite ref={ref} position={position} scale={[height * aspect, height, 1]} renderOrder={5}>
      <spriteMaterial
        map={texture}
        transparent
        opacity={0}
        depthWrite={false}
        depthTest={false}
        toneMapped={false}
      />
    </sprite>
  )
}

export function Links({
  links,
  positions,
  hoveredPlanet,
  hoveredLink,
  selection,
  onHoverLink
}: LinksProps): JSX.Element {
  return (
    <group>
      {links.map((l) => {
        const a = positions[l.a]
        const b = positions[l.b]
        if (!a || !b) return null
        const touched =
          hoveredPlanet === l.a ||
          hoveredPlanet === l.b ||
          selection.includes(l.a) ||
          selection.includes(l.b) ||
          hoveredLink === l.id
        return (
          <LinkCurve
            key={l.id}
            link={l}
            a={a}
            b={b}
            highlighted={touched}
            showLabel={hoveredLink === l.id || hoveredPlanet === l.a || hoveredPlanet === l.b}
            onHoverLink={onHoverLink}
          />
        )
      })}
    </group>
  )
}
