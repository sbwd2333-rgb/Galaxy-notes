import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import type { Link, Note } from '@shared/types'
import { C } from '@shared/constants'
import { Planet } from './Planet'
import { Links } from './Links'
import { Starfield } from './Starfield'
import type { Vec3 } from '../../lib/layout'
import type { CameraState } from '@shared/types'

export interface SceneApi {
  /** 屏幕坐标 → z=0 平面上的世界坐标（新建笔记落点用，规格书 A2） */
  screenToWorld: (x: number, y: number) => Vec3
  /** 相机飞到某颗星球（搜索结果定位用） */
  focusOn: (pos: Vec3, distance?: number) => void
}

interface GalaxySceneProps {
  notes: Note[]
  links: Link[]
  positions: Record<string, Vec3>
  degrees: Record<string, number>
  selection: string[]
  hoveredPlanet: string | null
  hoveredLink: string | null
  camera: CameraState
  editing: boolean
  /** 布局编辑模式：星球可以拖动 */
  layoutEditing: boolean
  sceneApi: React.MutableRefObject<SceneApi | null>
  onHoverPlanet: (gid: string | null) => void
  onHoverLink: (id: string | null) => void
  onPlanetClick: (gid: string) => void
  onPlanetSelect: (gid: string) => void
  onPlanetContextMenu: (gid: string) => void
  onPlanetDragEnd: (gid: string, pos: Vec3) => void
  onBlankClick: () => void
  onBlankContextMenu: (x: number, y: number) => void
  onCameraChange: (camera: CameraState) => void
}

function SceneBridge({
  sceneApi,
  flyRef
}: {
  sceneApi: React.MutableRefObject<SceneApi | null>
  flyRef: React.MutableRefObject<((pos: Vec3, distance?: number) => void) | null>
}): null {
  const { camera, gl } = useThree()
  useEffect(() => {
    const raycaster = new THREE.Raycaster()
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    const hit = new THREE.Vector3()
    sceneApi.current = {
      screenToWorld: (x: number, y: number): Vec3 => {
        // canvas 不一定从 (0,0) 开始（左边有侧边栏），按画布自己的矩形换算
        const rect = gl.domElement.getBoundingClientRect()
        const px = x - rect.left
        const py = y - rect.top
        const ndc = new THREE.Vector2((px / rect.width) * 2 - 1, -(py / rect.height) * 2 + 1)
        raycaster.setFromCamera(ndc, camera)
        const ok = raycaster.ray.intersectPlane(plane, hit)
        if (!ok) {
          const dir = new THREE.Vector3()
          camera.getWorldDirection(dir)
          return [camera.position.x + dir.x, camera.position.y + dir.y, camera.position.z + dir.z]
        }
        // 屏幕边缘的射线会和 z=0 平面交到很远的地方，把落点收在星系半径内
        const p = hit.clone()
        const dist = p.length()
        if (dist > 90) p.multiplyScalar(90 / dist)
        // 正好落在原点会被当成「还没定位」，给一点偏移避开
        if (p.length() < 0.001) p.set(0.5, 0.5, 0)
        return [p.x, p.y, p.z]
      },
      focusOn: (pos: Vec3, distance?: number) => {
        flyRef.current?.(pos, distance)
      }
    }
  }, [camera, gl, sceneApi, flyRef])
  return null
}

function CameraRig({
  initial,
  onChange,
  flyRef
}: {
  initial: CameraState
  onChange: (camera: CameraState) => void
  flyRef: React.MutableRefObject<((pos: Vec3, distance?: number) => void) | null>
}): JSX.Element {
  const controlsRef = useRef<any>(null)
  const timer = useRef<number | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const flight = useRef<{
    fromPos: THREE.Vector3
    toPos: THREE.Vector3
    fromTarget: THREE.Vector3
    toTarget: THREE.Vector3
    start: number
    dur: number
  } | null>(null)

  const camKey = `${initial.position.join(',')}|${initial.target.join(',')}`

  // 切换星系时把相机跳回这个库自己保存的机位
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    controls.object.position.set(initial.position[0], initial.position[1], initial.position[2])
    controls.target.set(initial.target[0], initial.target[1], initial.target[2])
    controls.update()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camKey])

  // 注册「飞到某颗星球」
  useEffect(() => {
    flyRef.current = (pos: Vec3, distance = 42) => {
      const controls = controlsRef.current
      if (!controls) return
      const target = new THREE.Vector3(pos[0], pos[1], pos[2])
      const dir = controls.object.position.clone().sub(controls.target)
      if (dir.lengthSq() < 1e-6) dir.set(0, 0.3, 1)
      dir.normalize()
      const toPos = target.clone().add(dir.multiplyScalar(distance))
      flight.current = {
        fromPos: controls.object.position.clone(),
        toPos,
        fromTarget: controls.target.clone(),
        toTarget: target,
        start: performance.now(),
        dur: 900
      }
    }
    return () => {
      flyRef.current = null
    }
  }, [flyRef])

  useFrame(() => {
    const f = flight.current
    const controls = controlsRef.current
    if (!f || !controls) return
    const t = Math.min(1, (performance.now() - f.start) / f.dur)
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    controls.object.position.lerpVectors(f.fromPos, f.toPos, e)
    controls.target.lerpVectors(f.fromTarget, f.toTarget, e)
    controls.update()
    if (t >= 1) flight.current = null
  })

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    const handler = (): void => {
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        onChangeRef.current({
          position: [controls.object.position.x, controls.object.position.y, controls.object.position.z],
          target: [controls.target.x, controls.target.y, controls.target.z]
        })
      }, 600)
    }
    controls.addEventListener('change', handler)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
      controls.removeEventListener('change', handler)
    }
  }, [])

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={C.MIN_DISTANCE}
      maxDistance={C.MAX_DISTANCE}
      maxPolarAngle={C.MAX_POLAR}
      enablePan={false}
    />
  )
}

export function GalaxyScene(props: GalaxySceneProps): JSX.Element {
  const pointerDown = useRef<{ x: number; y: number } | null>(null)
  const planetMenuHandled = useRef(false)
  const flyRef = useRef<((pos: Vec3, distance?: number) => void) | null>(null)

  return (
    <div
      className={`galaxy-root ${props.layoutEditing ? 'layout-editing' : ''}`}
      onPointerDown={(e) => {
        pointerDown.current = { x: e.clientX, y: e.clientY }
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        if (props.layoutEditing) return
        if (planetMenuHandled.current) {
          planetMenuHandled.current = false
          return
        }
        props.onBlankContextMenu(e.clientX, e.clientY)
      }}
    >
      <Canvas
        camera={{
          fov: C.CAMERA_FOV,
          near: 0.1,
          far: 2000,
          position: props.camera.position
        }}
        dpr={props.editing ? 1 : [1, 2]}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        onPointerMissed={(e) => {
          const d = pointerDown.current
          if (!d) return
          if (props.layoutEditing) return
          const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y)
          if (moved < C.CLICK_SLOP_PX) props.onBlankClick()
        }}
      >
        <color attach="background" args={[C.BG]} />
        <ambientLight intensity={0.6} />
        <SceneBridge sceneApi={props.sceneApi} flyRef={flyRef} />
        <CameraRig initial={props.camera} onChange={props.onCameraChange} flyRef={flyRef} />
        <Starfield />

        {props.notes.map((n) => {
          const pos = props.positions[n.gid]
          if (!pos) return null
          return (
            <Planet
              key={n.gid}
              gid={n.gid}
              title={n.title}
              color={n.color}
              position={pos}
              degree={props.degrees[n.gid] ?? 0}
              scale={n.scale ?? 1}
              selected={props.selection.includes(n.gid)}
              hovered={props.hoveredPlanet === n.gid}
              layoutEditing={props.layoutEditing}
              onHover={props.onHoverPlanet}
              onSelect={props.onPlanetSelect}
              onOpen={props.onPlanetClick}
              onPlanetContextMenu={(gid) => {
                planetMenuHandled.current = true
                props.onPlanetContextMenu(gid)
              }}
              onDragEnd={props.onPlanetDragEnd}
            />
          )
        })}

        <Links
          links={props.links}
          positions={props.positions}
          hoveredPlanet={props.hoveredPlanet}
          hoveredLink={props.hoveredLink}
          selection={props.selection}
          onHoverLink={props.onHoverLink}
        />

        <EffectComposer>
          <Bloom
            intensity={C.BLOOM_INTENSITY}
            luminanceThreshold={C.BLOOM_THRESHOLD}
            luminanceSmoothing={0.5}
            radius={C.BLOOM_RADIUS}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>
    </div>
  )
}
