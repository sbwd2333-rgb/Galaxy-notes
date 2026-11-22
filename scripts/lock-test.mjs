/**
 * 中键锁定视线中心冒烟：
 *  1) 右上角有「锁定」按钮（未锁定状态）
 *  2) 中键点星球 → 按钮变「已锁定」
 *  3) 再中键点同一颗 → 解锁
 *  4) 锁定后点按钮 → 回到自由视角
 *
 * 用法：node scripts/lock-test.mjs
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
  noteUpdate: async (id, patch) => { window.__CALLS__.push({ fn: 'noteUpdate', id, patch }); return notes[0]; },
  noteDelete: async () => ({ ok: true }),
  linkCreate: async () => ({ link: {}, existed: false }), linkUpdate: async () => ({}), linkDelete: async () => ({ ok: true }),
  assetSave: async () => ({ relPath: 'x' }), pickImage: async () => null, clipboardReadImage: async () => null,
  showContextMenu: async () => null,
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
const CX = 838
const CY = 450

const btn = page.locator('.lock-btn')
const label = async () => (await btn.innerText()).trim()

steps.push({ step: 'lock-btn-exists', ok: (await btn.count()) === 1, text: await label() })

// 中键点星球 → 锁定
await page.mouse.click(CX, CY, { button: 'middle' })
await page.waitForTimeout(700)
const lockedClass = await page.locator('.lock-btn.locked').count()
const lockedText = await label()
steps.push({ step: 'middle-click-locks', ok: lockedClass === 1 && lockedText.includes('已锁定'), lockedText })
await page.screenshot({ path: 'preview-lock.png' })

// 再中键点同一颗 → 解锁
await page.mouse.click(CX, CY, { button: 'middle' })
await page.waitForTimeout(700)
const afterToggle = await label()
steps.push({ step: 'middle-click-unlocks', ok: afterToggle.includes('锁定') && !afterToggle.includes('已'), afterToggle })

// 重新锁定，然后点按钮解锁
await page.mouse.click(CX, CY, { button: 'middle' })
await page.waitForTimeout(600)
const reLocked = await page.locator('.lock-btn.locked').count()
await page.locator('.lock-btn').click()
await page.waitForTimeout(600)
const afterBtn = await label()
const lockedAfterBtn = await page.locator('.lock-btn.locked').count()
steps.push({
  step: 'button-unlocks',
  ok: reLocked === 1 && afterBtn.includes('锁定') && lockedAfterBtn === 0,
  reLocked,
  afterBtn,
  lockedAfterBtn
})

await browser.close()
server.close()
console.log(JSON.stringify({ steps, errors }, null, 2))
process.exit(steps.every((s) => s.ok) && errors.length === 0 ? 0 : 1)
