import { useMemo } from 'react'
import * as THREE from 'three'
import { C } from '@shared/constants'

/** 背景星尘：5000 个点，随机分布在半径 400 的球壳内，不参与射线检测（规格书 §7.6） */
export function Starfield(): JSX.Element {
  const geometry = useMemo(() => {
    const count = C.STARFIELD_COUNT
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    let seed = 0x9e3779b9
    const rand = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0
      return ((seed >>> 0) % 100000) / 100000
    }
    for (let i = 0; i < count; i++) {
      // 球壳内均匀分布（半径的立方根分布）
      const r = C.STARFIELD_RADIUS * Math.cbrt(0.15 + rand() * 0.85)
      const theta = rand() * Math.PI * 2
      const phi = Math.acos(2 * rand() - 1)
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.cos(phi) * 0.7
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
      const lum = 0.15 + rand() * 0.45
      colors[i * 3] = lum
      colors[i * 3 + 1] = lum
      colors[i * 3 + 2] = lum * 1.06
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return geo
  }, [])

  return (
    <points frustumCulled={false} raycast={() => undefined} geometry={geometry}>
      <pointsMaterial
        size={1.6}
        sizeAttenuation
        transparent
        opacity={0.85}
        vertexColors
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  )
}
