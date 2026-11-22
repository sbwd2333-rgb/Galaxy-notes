/**
 * 星球大小滑条冒烟：
 *  1) 右键星球 → 改颜色/外观 → 弹「星球外观」
 *  2) 里面有大小滑条，拖到 2.2× 会调用 noteUpdate({ scale })
 *  3) 另外两件事：颜色按钮仍在、恢复默认能回到 1
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
  noteUpdate: async (id, patch) => { window.__CALLS__.push({ fn: 'noteUpdate', id, patch }); Object.assign(notes[0], patch); return notes[0]; },
  noteDelete: async () => ({ ok: true }),
  linkCreate: async () => ({ link: {}, existed: false }), linkUpdate: async () => ({}), linkDelete: async () => ({ ok: true }),
  assetSave: async () => ({ relPath: 'x' }), pickImage: async () => null, clipboardReadImage: async () => null,
  showContextMenu: async () => { window.__CALLS__.push({ fn: 'menu' }); return 'recolor'; },
  notify: async () => {}, writeClipboard: async () => {}, setWindowTitle: async () => {},
  readyToClose: () => {}, onFlushRequest: () => () => {}
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

// 星球在原点，画布中心约 (838, 450)
await page.mouse.move(838, 450)
await page.waitForTimeout(300)
const tip = await page.locator('.planet-tip').count()

await page.mouse.click(838, 450, { button: 'right' })
await page.waitForTimeout(900)
const modalTitle = await page.locator('.modal-title').innerText().catch(() => '')
const hasRange = await page.locator('.scale-row input[type=range]').count()
const hasSwatches = await page.locator('.swatch').count()
steps.push({
  step: 'appearance-modal',
  ok: modalTitle.includes('星球外观') && hasRange === 1 && hasSwatches === 6,
  tip,
  modalTitle,
  hasRange,
  hasSwatches
})

// 拖到 2.2
await page.locator('.scale-row input[type=range]').evaluate((el) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(el, '2.2')
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
await page.waitForTimeout(600)
const valueText = await page.locator('.scale-value').innerText().catch(() => '')
const calls = await page.evaluate(() => window.__CALLS__)
const scaled = calls.filter((c) => c.fn === 'noteUpdate' && typeof c.patch.scale === 'number')
const lastScale = scaled.length ? scaled[scaled.length - 1].patch.scale : null
steps.push({ step: 'slider-updates', ok: valueText.includes('2.2') && lastScale === 2.2, valueText, lastScale })
await page.screenshot({ path: 'preview-scale.png' })

// 恢复默认
await page.locator('.scale-actions .link-btn').click()
await page.waitForTimeout(600)
const backCalls = await page.evaluate(() => window.__CALLS__)
const resets = backCalls.filter((c) => c.fn === 'noteUpdate' && c.patch.scale === 1)
steps.push({ step: 'reset-to-default', ok: resets.length > 0 })

// 关掉弹窗
await page.locator('.modal-card .btn.ghost').click()
await page.waitForTimeout(400)
const closed = await page.locator('.modal-card').count()
steps.push({ step: 'modal-closes', ok: closed === 0 })

await browser.close()
server.close()
console.log(JSON.stringify({ steps, errors }, null, 2))
process.exit(steps.every((s) => s.ok) && errors.length === 0 ? 0 : 1)
