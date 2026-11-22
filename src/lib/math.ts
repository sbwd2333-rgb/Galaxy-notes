/** 确定性哈希与 PRNG：同一 gid 在任何机器上生成同一张星球纹理（规格书 §7.3） */

export function hash32(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Fibonacci 球面分布（规格书 §7.2） */
export function fibonacciSphere(
  i: number,
  n: number,
  radius: number
): [number, number, number] {
  if (n <= 1) return [0, 0, 0]
  const y = 1 - (i / (n - 1)) * 2
  const r = Math.sqrt(Math.max(0, 1 - y * y))
  const theta = i * 2.399963
  return [Math.cos(theta) * r * radius, y * radius, Math.sin(theta) * r * radius]
}
