/**
 * 布局编辑（拖动星球）冒烟：
 *  1) 点「编辑位置」→ 顶部工具条出现
 *  2) 拖动星球 → 点「退出」弹确认框
 *  3a) 选「保存并退出」→ noteUpdate 带新 pos
 *  3b) 再拖一次选「不保存，恢复原样」→ 不写盘
 *  4) 编辑模式下点星球不会进编辑器
 *
 * 用法：node scripts/layout-test.mjs
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

// 1) 进入编辑模式
await page.locator('.layout-entry').click()
await page.waitForTimeout(600)
const bar = await page.locator('.layout-bar').count()
const barText = await page.locator('.layout-bar-text').innerText().catch(() => '')
steps.push({ step: 'enter-layout-mode', ok: bar > 0 && barText.includes('拖动'), bar, barText })
await page.screenshot({ path: 'preview-layout.png' })

// 编辑模式下点星球不应进编辑器
await page.mouse.click(CX, CY)
await page.waitForTimeout(600)
const editorOpened = await page.locator('.editor-card').count()
steps.push({ step: 'no-editor-in-layout-mode', ok: editorOpened === 0 })

// 2) 拖动星球：(838,450) → (980,520)
await page.mouse.move(CX, CY)
await page.mouse.down()
await page.mouse.move(900, 490, { steps: 6 })
await page.mouse.move(980, 520, { steps: 6 })
await page.mouse.up()
await page.waitForTimeout(500)

// 3) 退出 → 确认框
await page.locator('.layout-bar .btn.ghost').click()
await page.waitForTimeout(500)
const dialog = await page.locator('.modal-title').innerText().catch(() => '')
steps.push({ step: 'confirm-on-exit', ok: dialog.includes('保存位置改动'), dialog })

// 3a) 保存并退出
await page.locator('.modal-card .btn.primary').click()
await page.waitForTimeout(900)
const calls1 = await page.evaluate(() => window.__CALLS__)
const saved = calls1.filter((c) => c.fn === 'noteUpdate' && Array.isArray(c.patch.pos))
const savedPos = saved.length ? saved[saved.length - 1].patch.pos : null
const stillEditing = await page.locator('.layout-bar').count()
steps.push({
  step: 'save-and-exit',
  ok: saved.length === 1 && !!savedPos && Math.abs(savedPos[0]) > 1 && stillEditing === 0,
  savedCount: saved.length,
  savedPos,
  stillEditing
})

// 3b) 再拖一次（星球现在在 980,520 附近），选「不保存，恢复原样」
await page.locator('.layout-entry').click()
await page.waitForTimeout(500)
await page.mouse.move(980, 520)
await page.mouse.down()
await page.mouse.move(760, 400, { steps: 6 })
await page.mouse.up()
await page.waitForTimeout(400)
await page.locator('.layout-bar .btn.ghost').click()
await page.waitForTimeout(400)
await page.locator('.modal-card .btn.ghost').click()
await page.waitForTimeout(700)
const calls2 = await page.evaluate(() => window.__CALLS__)
const savedAfter = calls2.filter((c) => c.fn === 'noteUpdate' && Array.isArray(c.patch.pos)).length
const exited = await page.locator('.layout-bar').count()
steps.push({
  step: 'discard-and-exit',
  ok: savedAfter === 1 && exited === 0,
  savedAfter,
  exited
})

await browser.close()
server.close()
console.log(JSON.stringify({ steps, errors }, null, 2))
process.exit(steps.every((s) => s.ok) && errors.length === 0 ? 0 : 1)
