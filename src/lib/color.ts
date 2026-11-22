import { C } from '@shared/constants'

export const PALETTE = C.PALETTE

export function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  return [h, s, l]
}

export function hsla(h: number, s: number, l: number, a: number): string {
  h = ((h % 1) + 1) % 1
  return `hsla(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%, ${a})`
}

/** 在基色上做色相/明度偏移（规格书 §7.3） */
export function shift(hex: string, hueShift: number, alpha: number, lightBoost = 0): string {
  const [h, s, l] = hexToHsl(hex)
  return hsla(h + hueShift, Math.min(1, s * 0.9 + 0.1), Math.min(0.85, l + lightBoost), alpha)
}

export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

export function pickLeastUsedColor(used: string[]): string {
  const counts = new Map<string, number>(PALETTE.map((c) => [c, 0]))
  for (const c of used) counts.set(c, (counts.get(c) ?? 0) + 1)
  let best: string = PALETTE[0]
  let bestCount = Number.POSITIVE_INFINITY
  for (const c of PALETTE) {
    const v = counts.get(c) ?? 0
    if (v < bestCount) {
      bestCount = v
      best = c
    }
  }
  return best
}
