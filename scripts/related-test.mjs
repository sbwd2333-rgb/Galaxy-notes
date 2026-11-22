/**
 * 反向链接（关联笔记）冒烟：
 *  1) 打开有 1 条关联的笔记 → 编辑器底部出现「关联 1」和对方标题
 *  2) 点这个 chip → 编辑器切到另一篇
 *  3) 打开没有关联的笔记 → 显示空提示
 *
 * 用法：node scripts/related-test.mjs
 */
import { createServer } from 'node:http'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { chromium } from 'playwright-core'

const root = path.join(process.cwd(), 'out', 'renderer')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

const palette = ['#6ea8ff', '#7ee0b8', '#f5b971', '#e07a9b']

const mock = `
window.__CALLS__ = [];
const palette = ${JSON.stringify(palette)};
const notes = [
  { gid: 'n1', title: '一篇讲注意力的', text: '注意力是稀缺资源', color: palette[0], pos: [-30, 10, 0] },
  { gid: 'n2', title: '另一篇讲时间的', text: '时间管理的本质是取舍', color: palette[1], pos: [30, -10, 0] },
  { gid: 'n3', title: '孤零零的一篇', text: '没有关联', color: palette[2], pos: [0, 0, 30] }
].map(n => ({
  ...n,
  created: '2026-11-20T10:00:00.000+08:00',
  updated: '2026-11-20T10:00:00.000+08:00',
  scale: 1,
  doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: n.text }] }] }
}));
const links = [{ id: 'l1', a: 'n1', b: 'n2', label: '互为前提', origin: 'manual', created: '2026-11-20T10:00:00.000+08:00', aiRationale: null }];
const settings = { version: 1, vaultPath: 'C:/mock', lastNoteId: null,
  camera: { position: [0, 40, 120], target: [0,0,0] }, window: { width: 1440, height: 900, maximized: false } };
window.api = {
  vaultLoad: async () => ({ notes, links, settings, corrupt: [] }),
  vaultList: async () => [{ path: 'C:/mock', name: '测试星系', noteCount: notes.length, active: true }],
  vaultCreate: async () => ({ ok: false, reason: 'cancelled' }),
  vaultSwitch: async () => null, vaultRemove: async () => [],
  vaultDelete: async () => ({ scope: 'whole', remaining: [], nextActive: null, deletedActive: false }),
  vaultReveal: async () => true, vaultRename: async () => null, vaultSelect: async () => null,
  vaultInit: async () => ({ ok: true, welcomeNoteId: 'n1' }), vaultCheckPath: async () => ({ ok: true }),
  vaultSaveSettings: async () => {},
  noteCreate: async () => notes[0], noteRead: async (id) => notes.find(n => n.gid === id),
  noteUpdate: async (id, patch) => { window.__CALLS__.push({ fn: 'noteUpdate', id, patch }); const n = notes.find(x => x.gid === id); if (n) Object.assign(n, patch); return n ?? notes[0]; },
  noteDelete: async () => ({ ok: true }),
  linkCreate: async () => ({ link: {}, existed: false }), linkUpdate: async () => ({}), linkDelete: async () => ({ ok: true }),
  assetSave: async () => ({ relPath: 'x' }), pickImage: async () => null, clipboardReadImage: async () => null,
  showContextMenu: async () => null, notify: async () => {}, writeClipboard: async () => {},
  setWindowTitle: async () => {}, readyToClose: () => {}, onFlushRequest: () => () => {}
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
await page.waitForTimeout(6000)

const steps = []

// 用搜索打开第一篇（比在星系里扫星球可靠）
await page.fill('.search-input', '一篇讲注意力')
await page.waitForTimeout(500)
await page.locator('.search-result').first().click()
await page.waitForTimeout(1200)

const label = await page.locator('.editor-links-label').innerText().catch(() => '')
const chips = await page.locator('.link-chip').count()
const chipTitle = await page.locator('.chip-title').first().innerText().catch(() => '')
const chipLabel = await page.locator('.chip-label').first().innerText().catch(() => '')
steps.push({
  step: 'related-panel',
  ok: label.includes('关联 1') && chips === 1 && chipTitle.includes('另一篇讲时间'),
  label,
  chips,
  chipTitle,
  chipLabel
})
await page.screenshot({ path: 'preview-related.png' })

// 点 chip → 切到另一篇
await page.locator('.link-chip').first().click()
await page.waitForTimeout(1500)
const newTitle = await page.locator('.editor-title').inputValue().catch(() => '')
const flushed = await page.evaluate(() => window.__CALLS__.some((c) => c.fn === 'noteUpdate'))
steps.push({ step: 'switch-to-related', ok: newTitle.includes('另一篇讲时间'), newTitle, flushed })

// 打开没有关联的第三篇
await page.keyboard.press('Escape')
await page.waitForTimeout(900)
await page.fill('.search-input', '孤零零')
await page.waitForTimeout(500)
await page.locator('.search-result').first().click()
await page.waitForTimeout(1200)
const empty = await page.locator('.editor-links-empty').count()
steps.push({ step: 'no-related-hint', ok: empty > 0, empty })

await browser.close()
server.close()
console.log(JSON.stringify({ steps, errors }, null, 2))
process.exit(steps.every((s) => s.ok) && errors.length === 0 ? 0 : 1)
