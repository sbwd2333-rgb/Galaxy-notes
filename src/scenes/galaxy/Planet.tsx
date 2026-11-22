import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { getPlanetTexture, getSelectionRingTexture, getGlowTexture } from './PlanetTexture'
import { C, UNTITLED } from '@shared/constants'
import type { Vec3 } from '../../lib/layout'

export interface PlanetProps {
  gid: string
  title: string
  color: string
  position: Vec3
  degree: number
  /** 手动大小倍率（0.6~2.5），用来突出重点笔记 */
  scale: number
  selected: boolean
  hovered: boolean
  onHover: (gid: string | null) => void
  onSelect: (gid: string) => void
  onOpen: (gid: string) => void
  onPlanetContextMenu: (gid: string) => void
}

export function planetRadius(degree: number): number {
  return Math.min(C.PLANET_MAX_RADIUS, C.PLANET_BASE_RADIUS * (1 + Math.log(1 + degree) * 0.25))
}

/**
 * 视觉放大系数。规格书 §7.4 的半径公式保持不动（它决定星球之间的相对大小），
 * 但这个公式算出来的球在默认镜头距离下只有十来个像素，看不清纹理也认不出是"星球"。
 * 这里只放大 Sprite 的显示尺寸，不改变数据层。
 */
const PLANET_VISUAL = 2.2

export function Planet({
  gid,
  title,
  color,
  position,
  degree,
  scale,
  selected,
  hovered,
  onHover,
  onSelect,
  onOpen,
  onPlanetContextMenu
}: PlanetProps): JSX.Element {
  const spriteRef = useRef<THREE.Sprite>(null)
  const ringRef = useRef<THREE.Sprite>(null)
  const [showTitle, setShowTitle] = useState(false)

  const texture = useMemo(() => getPlanetTexture(gid, color), [gid, color])
  const glowTexture = useMemo(() => getGlowTexture(color), [color])
  const ringTexture = useMemo(() => getSelectionRingTexture(), [])

  const radius = planetRadius(degree) * PLANET_VISUAL * scale
  const baseScale = radius * 2
  const targetScale = baseScale * Math.max(hovered ? C.HOVER_SCALE : 1, selected ? C.SELECT_SCALE : 1)

  // 悬停 150ms 后才浮现标题（规格书 §6 #9）
  useEffect(() => {
    if (!hovered) {
      setShowTitle(false)
      return
    }
    const t = window.setTimeout(() => setShowTitle(true), C.HOVER_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [hovered])

  useFrame((_, delta) => {
    const s = spriteRef.current
    if (s) {
      const cur = s.scale.x
      const next = THREE.MathUtils.damp(cur, targetScale, 12, Math.min(delta, 0.05))
      s.scale.set(next, next, 1)
    }
    const ring = ringRef.current
    if (ring) {
      ring.visible = selected
      const mat = ring.material as THREE.SpriteMaterial
      const targetOpacity = selected ? 1 : 0
      mat.opacity = THREE.MathUtils.damp(mat.opacity, targetOpacity, 14, Math.min(delta, 0.05))
      const ringScale = (spriteRef.current?.scale.x ?? baseScale) * 1.32
      ring.scale.set(ringScale, ringScale, 1)
    }
  })

  const displayTitle = title.trim() || UNTITLED

  return (
    <group position={position}>
      {/* 柔光层：让远景下的星球是「一颗发光的星」而不是一个彩色小点 */}
      <sprite
        scale={[baseScale * 2.7, baseScale * 2.7, 1]}
        renderOrder={1}
        raycast={() => undefined}
      >
        <spriteMaterial
          map={glowTexture}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          opacity={hovered ? 0.9 : 0.62}
          toneMapped={false}
        />
      </sprite>

      <sprite
        ref={spriteRef}
        scale={[baseScale, baseScale, 1]}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          onHover(gid)
        }}
        onPointerOut={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          onHover(null)
        }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          if (e.nativeEvent.ctrlKey) onSelect(gid)
          else onOpen(gid)
        }}
        onContextMenu={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          e.nativeEvent.preventDefault()
          onPlanetContextMenu(gid)
        }}
        renderOrder={2}
      >
        <spriteMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
      </sprite>

      <sprite ref={ringRef} visible={false} renderOrder={3}>
        <spriteMaterial
          map={ringTexture}
          transparent
          depthWrite={false}
          opacity={0}
          toneMapped={false}
        />
      </sprite>

      {showTitle && (
        <Html
          center
          position={[0, radius + 0.9, 0]}
          style={{ pointerEvents: 'none' }}
          zIndexRange={[20, 10]}
        >
          <div className="planet-tip">{displayTitle}</div>
        </Html>
      )}
    </group>
  )
}
