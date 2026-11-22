import * as THREE from 'three'
import { hash32, mulberry32 } from '../../lib/math'
import { shift } from '../../lib/color'
import { C } from '@shared/constants'

/**
 * 星球纹理（规格书 §7.3 的完整实现）。
 * 核心要求：确定性 —— 同一个 gid 在任何机器上生成完全一致的纹理。
 */

const cache = new Map<string, THREE.CanvasTexture>()

export function getPlanetTexture(gid: string, baseHex: string): THREE.CanvasTexture {
  const key = `${gid}:${baseHex}`
  const hit = cache.get(key)
  if (hit) return hit

  const S = C.PLANET_TEX_SIZE
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const ctx = cv.getContext('2d')!
  const rand = mulberry32(hash32(gid))

  // 1. 底色
  ctx.fillStyle = baseHex
  ctx.fillRect(0, 0, S, S)

  // 2. 三层斑块（大陆 / 云带），越外层越细碎
  for (let layer = 0; layer < 3; layer++) {
    const count = 6 + layer * 5
    for (let i = 0; i < count; i++) {
      const x = rand() * S
      const y = rand() * S
      const r = (0.15 + rand() * 0.25) * S
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, shift(baseHex, (rand() - 0.5) * 0.5, 0.55 * (1 - layer * 0.25), 0.05))
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, S, S)
    }
  }

  // 3. 球面明暗：光源左上，边缘压暗（这一步让它"看起来是个球"）
  const shade = ctx.createRadialGradient(S * 0.38, S * 0.34, S * 0.05, S * 0.5, S * 0.5, S * 0.5)
  shade.addColorStop(0, 'rgba(255,255,255,0.30)')
  shade.addColorStop(0.55, 'rgba(0,0,0,0)')
  shade.addColorStop(1, 'rgba(0,0,0,0.78)')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, S, S)

  // 4. 大气辉光（外圈彩色光晕）
  const glow = ctx.createRadialGradient(S / 2, S / 2, S * 0.34, S / 2, S / 2, S * 0.5)
  glow.addColorStop(0, 'rgba(0,0,0,0)')
  glow.addColorStop(1, shift(baseHex, 0, 0.35))
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, S, S)

  // 5. 圆形 alpha 遮罩 —— 规格书的纹理是满幅方图，直接贴到 Sprite 上会露出方角；
  //    这一步把四角擦成透明，星球才是圆的。确定性不受影响。
  ctx.globalCompositeOperation = 'destination-in'
  const mask = ctx.createRadialGradient(S / 2, S / 2, S * 0.4, S / 2, S / 2, S * 0.5)
  mask.addColorStop(0, 'rgba(0,0,0,1)')
  mask.addColorStop(0.75, 'rgba(0,0,0,1)')
  mask.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = mask
  ctx.fillRect(0, 0, S, S)
  ctx.globalCompositeOperation = 'source-over'

  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  cache.set(key, tex)
  return tex
}

const glowCache = new Map<string, THREE.CanvasTexture>()

/**
 * 星球外围的柔光层（additive）。
 * 远景下星球只有十来个像素，靠这层光晕才看得出"这里有一颗星"，
 * 而不是一堆彩色小点。
 */
export function getGlowTexture(color: string): THREE.CanvasTexture {
  const hit = glowCache.get(color)
  if (hit) return hit
  const S = 128
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const ctx = cv.getContext('2d')!
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0, shift(color, 0, 0.5))
  g.addColorStop(0.35, shift(color, 0, 0.16))
  g.addColorStop(0.7, shift(color, 0, 0.04))
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  glowCache.set(color, tex)
  return tex
}

/** 选中环：金色细描边 + 外发光，单独一张 Sprite 叠在星球上 */
let ringTexture: THREE.CanvasTexture | null = null

export function getSelectionRingTexture(): THREE.CanvasTexture {
  if (ringTexture) return ringTexture
  const S = 256
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const ctx = cv.getContext('2d')!
  ctx.clearRect(0, 0, S, S)
  ctx.strokeStyle = C.SELECT_RING
  ctx.lineWidth = 3
  ctx.shadowColor = C.SELECT_RING
  ctx.shadowBlur = 14
  ctx.beginPath()
  ctx.arc(S / 2, S / 2, S * 0.44, 0, Math.PI * 2)
  ctx.stroke()
  // 再描一圈更淡的，让环有呼吸感
  ctx.shadowBlur = 0
  ctx.globalAlpha = 0.35
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(S / 2, S / 2, S * 0.4, 0, Math.PI * 2)
  ctx.stroke()

  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  ringTexture = tex
  return tex
}

const labelCache = new Map<string, { texture: THREE.CanvasTexture; aspect: number }>()

/** 曲线标签 / 标题浮层用不到，这里只给连线标签做一张 Sprite 文字纹理 */
export function getLabelTexture(text: string): { texture: THREE.CanvasTexture; aspect: number } {
  const hit = labelCache.get(text)
  if (hit) return hit
  const fontSize = 40
  const padX = 28
  const padY = 16
  const measure = document.createElement('canvas').getContext('2d')!
  measure.font = `500 ${fontSize}px "Microsoft YaHei", "Segoe UI", system-ui, sans-serif`
  const w = Math.ceil(measure.measureText(text).width) + padX * 2
  const h = fontSize + padY * 2
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = 'rgba(10,12,18,0.82)'
  const r = h / 2
  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.arcTo(w, 0, w, h, r)
  ctx.arcTo(w, h, 0, h, r)
  ctx.arcTo(0, h, 0, 0, r)
  ctx.arcTo(0, 0, w, 0, r)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.font = `500 ${fontSize}px "Microsoft YaHei", "Segoe UI", system-ui, sans-serif`
  ctx.fillStyle = 'rgba(232,234,240,0.92)'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillText(text, w / 2, h / 2 + 1)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  const result = { texture: tex, aspect: w / h }
  labelCache.set(text, result)
  return result
}
