/**
 * 在真实 Electron 里验证图片插入：通过 CDP 连上已运行的实例，
 * 进入编辑器 → 派发一次带图片的 paste → 检查 <img> 的 naturalWidth。
 *
 * naturalWidth > 0 说明 asset://local/... 真的被加载了，
 * 这是 headless Chrome 里验证不了的一环。
 *
 * 用法：先以 --remote-debugging-port=9222 启动应用，再 node scripts/cdp-image-test.mjs
 */
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { chromium } from 'playwright-core'

const imgPath = path.join(process.cwd(), 'docs', 'screenshots', 'galaxy.png')
const b64 = (await fs.readFile(imgPath)).toString('base64')

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const contexts = browser.contexts()
const pages = contexts.flatMap((c) => c.pages())
const page = pages.find((p) => p.url().includes('renderer')) ?? pages[0]
if (!page) {
  console.log(JSON.stringify({ ok: false, reason: 'no page' }))
  process.exit(1)
}
console.log('[cdp] page', page.url())

await page.waitForSelector('.galaxy-root', { timeout: 15000 }).catch(() => null)
await page.waitForTimeout(2500)

const result = { steps: [] }

// 1. 找一颗星球（画布从侧边栏右边开始）
let hit = null
outer: for (let y = 90; y < 860; y += 40) {
  for (let x = 260; x < 1400; x += 40) {
    await page.mouse.move(x, y)
    await page.waitForTimeout(120)
    if ((await page.locator('.planet-tip').count()) > 0) {
      hit = { x, y }
      break outer
    }
  }
}
result.steps.push({ step: 'find-planet', ok: !!hit, hit })
await page.mouse.move(5, 895)
await page.waitForTimeout(200)

if (hit) {
  await page.mouse.click(hit.x, hit.y)
  await page.waitForTimeout(1000)
  const card = await page.locator('.editor-card').count()
  result.steps.push({ step: 'enter-editor', ok: card > 0 })
  result.steps.push({ step: 'image-button', ok: (await page.locator('.editor-tool').count()) > 0 })

  if (card > 0) {
    const dispatched = await page.evaluate((b64) => {
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const file = new File([bytes], 'cdp-test.png', { type: 'image/png' })
      const dt = new DataTransfer()
      dt.items.add(file)
      const target = document.querySelector('.tiptap-body')
      if (!target) return { ok: false }
      target.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
      )
      return { ok: true }
    }, b64)
    result.steps.push({ step: 'dispatch-paste', ok: dispatched.ok })

    await page.waitForTimeout(2500)
    const imgInfo = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('.tiptap-body img'))
      return imgs.map((i) => ({
        src: i.getAttribute('src'),
        complete: i.complete,
        naturalWidth: i.naturalWidth,
        naturalHeight: i.naturalHeight,
        renderedWidth: Math.round(i.getBoundingClientRect().width)
      }))
    })
    const loaded = imgInfo.some((i) => i.naturalWidth > 0)
    result.steps.push({ step: 'asset-protocol-loads', ok: loaded, imgInfo })

    await page.screenshot({ path: 'preview-electron-image.png' })
  }
}

await browser.close()
const ok = result.steps.every((s) => s.ok)
console.log(JSON.stringify({ ok, ...result }, null, 2))
process.exit(ok ? 0 : 1)
