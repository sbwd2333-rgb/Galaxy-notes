/**
 * 星球外观冒烟（颜色和大小一起调）：
 *  1) 右键星球 → 弹「星球外观」，6 色 + 大小滑条
 *  2) 点色块：立即生效，但**弹窗不关**
 *  3) 接着拖滑条：弹窗仍然开着，值跟着变
 *  4) 点「完成」才关窗
 *  5) 「恢复原样」把颜色和大小一起还原
 *
 * 用法：node scripts/scale-test.mjs
 */
import { createServer } from 'node:http'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { chromium } from 'playwright-core'

const root = path.join(process.cwd(), 'out', 'renderer')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

const mock = `
window.__CALLS__ = [];
const notes = [{
  gid: 'solo', title: '一颗星球', text: '正文', color: '#6ea8ff', pos: [0, 0, 0], scale: 1,
  created: '2026-11-20T10:00:00.000+08:00', updated: '2026-11-20T10:00:00.000+08:00',
  doc: { type: 'doc', content: [{ type: 'paragraph' }] }
}];
const settings = { version: 1, vaultPath: 'C:/mock', lastNoteId: null,
  camera: { position: [0, 40, 120], target: [0,0,0] }, window: { width: 1440, height: 900, maximized: false } };
window.api = {
  vaultLoad: async () => ({ notes, links: [], settings, corrupt: [] }),
  vaultList: async () => [{ path: 'C:/mock', name: '测试星系', noteCount: 1, active: true }],
  vaultCreate: async () => ({ ok: false, reason: 'cancelled' }),
  vaultSwitch: async () => null, vaultRemove: async () => [],
  vaultDelete: async () => ({ scope: 'whole', remaining: [], nextActive: null, deletedActive: false }),
  vaultReveal: async () => true, vaultRename: async () => null, vaultSelect: async () => null,
  vaultInit: async () => ({ ok: true, welcomeNoteId: 'solo' }), vaultCheckPath: async () => ({ ok: true }),
  vaultSaveSettings: async () => {},
  noteCreate: async () => notes[0], noteRead: async () => notes[0],
  noteUpdate: async (id, patch) => {
    window.__CALLS__.push({ fn: 'noteUpdate', id, patch });
    Object.assign(notes[0], patch);
    return notes[0];
  },
  noteDelete: async () => ({ ok: true }),
  linkCreate: async () => ({ link: {}, existed: false }), linkUpdate: async () => ({}), linkDelete: async () => ({ ok: true }),
  assetSave: async () => ({ relPath: 'x' }), pickImage: async () => null, clipboardReadImage: async () => null,
  showContextMenu: async () => 'recolor',
  notify: async () => {}, writeClipboard: async () => {}, setWindowTitle: async () => {},
  readyToClose: () => {}, onFlushRequest: () => () => {},
  todosList: async () => [], todosAdd: async () => ({}), todosToggle: async () => null,
  todosRemove: async () => [], todosClearDone: async () => []
};
`

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname === '/__mock.js') {
    res.writeHead(200, { 'content-type': 'text/javascript' })
    res.end(mock)
    return
  }
  try {
    let rel = decodeURIComponent(url.pathname)
    if (rel === '/') rel = '/index.html'
    let body = await fs.readFile(path.join(root, rel))
    if (rel === '/index.html') {
      body = Buffer.from(
        body.toString('utf8').replace('<head>', '<head><script src="/__mock.js"></script></head>'),
        'utf8'
      )
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(rel)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404)
    res.end()
  }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
await page.emulateMedia({ reducedMotion: 'reduce' })
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' })
await page.waitForTimeout(5500)

const steps = []

// 打开「星球外观」
await page.mouse.move(838, 450)
await page.waitForTimeout(250)
await page.mouse.click(838, 450, { button: 'right' })
await page.waitForTimeout(800)
const modalTitle = await page.locator('.modal-title').innerText().catch(() => '')
const hasRange = await page.locator('.scale-row input[type=range]').count()
const swatches = await page.locator('.swatch').count()
steps.push({
  step: 'appearance-modal',
  ok: modalTitle.includes('星球外观') && hasRange === 1 && swatches === 6,
  modalTitle,
  hasRange,
  swatches
})

// 点第二个颜色：应即时生效且弹窗不关
await page.locator('.swatch').nth(1).click()
await page.waitForTimeout(500)
const stillOpen = await page.locator('.modal-card').count()
const activeColor = await page.locator('.swatch.on').evaluate((el) => getComputedStyle(el).backgroundColor)
const callsAfterColor = await page.evaluate(
  () => window.__CALLS__.filter((c) => c.fn === 'noteUpdate' && c.patch.color)
)
steps.push({
  step: 'color-keeps-modal',
  ok: stillOpen === 1 && callsAfterColor.length === 1,
  stillOpen,
  activeColor,
  colorCalls: callsAfterColor.length
})

// 接着拖大小：弹窗仍然开着
await page.locator('.scale-row input[type=range]').evaluate((el) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(el, '2.2')
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
await page.waitForTimeout(500)
const stillOpen2 = await page.locator('.modal-card').count()
const valueText = await page.locator('.scale-value').innerText().catch(() => '')
steps.push({ step: 'scale-after-color', ok: stillOpen2 === 1 && valueText.includes('2.2'), stillOpen2, valueText })
await page.screenshot({ path: 'preview-scale.png' })

// 「完成」才关窗
await page.locator('.modal-card .btn.primary').click()
await page.waitForTimeout(500)
steps.push({ step: 'done-closes', ok: (await page.locator('.modal-card').count()) === 0 })

// 再打开 → 改色 + 改大小 → 「恢复原样」应同时还原
await page.mouse.move(838, 450)
await page.waitForTimeout(250)
await page.mouse.click(838, 450, { button: 'right' })
await page.waitForTimeout(800)
await page.locator('.swatch').nth(3).click()
await page.waitForTimeout(300)
await page.locator('.scale-row input[type=range]').evaluate((el) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(el, '1.5')
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
await page.waitForTimeout(400)
await page.locator('.modal-actions .link-btn').click()
await page.waitForTimeout(600)
const calls = await page.evaluate(() => window.__CALLS__.filter((c) => c.fn === 'noteUpdate'))
const last = calls[calls.length - 1]
const resetOk =
  !!last && last.patch.color === '#7ee0b8' && Math.abs((last.patch.scale ?? 0) - 2.2) < 0.001
steps.push({
  step: 'reset-restores-both',
  ok: resetOk && (await page.locator('.modal-card').count()) === 0,
  lastPatch: last?.patch ?? null
})

await browser.close()
server.close()
console.log(JSON.stringify({ steps, errors }, null, 2))
process.exit(steps.every((s) => s.ok) && errors.length === 0 ? 0 : 1)
