import { useEffect, useRef, useState } from 'react'

/** 粒子配色：和星球调色板同源 */
const COLORS = ['#6ea8ff', '#b58cff', '#5fd0e0', '#7ee0b8', '#d9e6ff']

const DURATION = 3400
const LEAD_OUT = 500

/**
 * 开场动画：奇点由暗到亮 → 粒子爆开 → 汇聚成星系 → 品牌名浮出 → 淡出。
 * 只画在 canvas 上（DOM 只负责文字），大约 3.4 秒，单击/任意键可跳过。
 * 主界面在这层底下已经渲染好，所以淡出时是无缝的。
 */
export function Intro({ onDone }: { onDone: () => void }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [leaving, setLeaving] = useState(false)
  const finished = useRef(false)
  const timeouts = useRef<number[]>([])

  const finish = (): void => {
    if (finished.current) return
    finished.current = true
    setLeaving(true)
    const id = window.setTimeout(onDone, 420)
    timeouts.current.push(id)
  }

  // 点击 / 任意键跳过
  useEffect(() => {
    const onKey = (): void => finish()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      finish()
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    let w = 0
    let h = 0
    const resize = (): void => {
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const count = Math.max(420, Math.min(1200, Math.round((w * h) / 1700)))
    const parts = Array.from({ length: count }, () => {
      const a = Math.random() * Math.PI * 2
      return {
        a,
        r: 0.3 + Math.random() * 0.7,
        spin: (0.35 + Math.random() * 0.75) * (Math.random() > 0.5 ? 1 : -1),
        size: 0.5 + Math.random() * 1.7,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        lag: Math.random() * 0.2
      }
    })

    const start = performance.now()
    let raf = 0
    let ended = false

    const draw = (now: number): void => {
      const t = Math.min(1, (now - start) / DURATION)
      const cx = w / 2
      const cy = h / 2
      const maxR = Math.min(w, h) * 0.44

      ctx.clearRect(0, 0, w, h)

      // 背景微光：随爆发铺开
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 1.6)
      const g = 0.13 * Math.min(1, t * 4)
      glow.addColorStop(0, `rgba(120,170,255,${g})`)
      glow.addColorStop(0.45, `rgba(60,80,160,${g * 0.35})`)
      glow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, w, h)

      // 奇点：最开始的亮点
      if (t < 0.32) {
        const p = t / 0.32
        const core = 2 + p * 10
        const sg = ctx.createRadialGradient(cx, cy, 0, cx, cy, core * 3.2)
        sg.addColorStop(0, `rgba(255,255,255,${0.85 * (0.35 + p * 0.65)})`)
        sg.addColorStop(0.35, `rgba(150,190,255,${0.5 * p})`)
        sg.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = sg
        ctx.beginPath()
        ctx.arc(cx, cy, core * 3.2, 0, Math.PI * 2)
        ctx.fill()
      }

      // 粒子
      const fade = t > 0.9 ? Math.max(0, 1 - (t - 0.9) / 0.1) : 1
      ctx.globalCompositeOperation = 'lighter'
      for (const p of parts) {
        const tt = Math.max(0, Math.min(1, (t - p.lag) / 0.78))
        const e = 1 - Math.pow(1 - tt, 3)
        const radius = e * maxR * p.r
        const ang = p.a + p.spin * tt * 0.85
        const x = cx + Math.cos(ang) * radius
        const y = cy + Math.sin(ang) * radius * 0.84
        ctx.globalAlpha = (0.08 + 0.92 * e) * fade
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(x, y, p.size, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'

      if (t >= 1 && !ended) {
        ended = true
        finish()
        return
      }
      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      for (const id of timeouts.current) window.clearTimeout(id)
      timeouts.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={`intro ${leaving ? 'leaving' : ''}`} onClick={finish}>
      <canvas ref={canvasRef} className="intro-canvas" />
      <div className="intro-titles">
        <div className="intro-en">GALAXY NOTES</div>
        <div className="intro-cn">思维奇点</div>
        <div className="intro-sub">每个念头，都是一颗星球</div>
      </div>
      <div className="intro-skip">单击或按任意键跳过</div>
    </div>
  )
}

export const INTRO_DURATION = DURATION + LEAD_OUT
