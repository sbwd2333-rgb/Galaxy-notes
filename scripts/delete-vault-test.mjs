/**
 * 删除星系冒烟：
 *  1) 悬停星系列表项出现 ×
 *  2) 点 × 弹二次确认框（不直接删）
 *  3) 取消 → 什么都不发生
 *  4) 确认 → 调 vaultDelete，列表少一个
 *
 * 用法：node scripts/delete-vault-test.mjs
 */
import { createServer } from 'node:http'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { chromium } from 'playwright-core'

const root = path.join(process.cwd(), 'out', 'renderer')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

const palette = ['#6ea8ff', '#7ee0b8', '#f5b971', '#e07a9b', '#b58cff', '#5fd0e0']

const mock = `
window.__CALLS__ = [];
const palette = ${JSON.stringify(palette)};
const mk = (gid, title, i) => ({
  gid, title, created: '2026-11-20T10:00:00.000+08:00', updated: '2026-11-20T10:00:00.000+08:00',
  color: palette[i % palette.length], pos: [i * 12 - 20, 8, i * 9],
  doc: { type: 'doc', content: [{ type: 'paragraph' }] }, text: ''
});
let vaults = [
  { path: 'C:/A', name: '星系 A', noteCount: 2, active: true },
  { path: 'C:/B', name: '星系 B', noteCount: 3, active: false }
];
const notesA = [mk('a0', 'A 的第一篇', 0), mk('a1', 'A 的第二篇', 1)];
const settings = { version: 1, vaultPath: 'C:/A', lastNoteId: null,
  camera: { position: [0, 40, 120], target: [0,0,0] }, window: { width: 1440, height: 900, maximized: false } };
window.api = {
  vaultLoad: async () => ({ notes: notesA, links: [], settings, corrupt: [] }),
  vaultList: async () => vaults,
  vaultCreate: async () => ({ ok: false, reason: 'cancelled' }),
  vaultSwitch: async () => null,
  vaultRemove: async () => vaults,
  vaultDelete: async (p) => {
    window.__CALLS__.push({ fn: 'vaultDelete', path: p });
    vaults = vaults.filter(v => v.path !== p);
    return { scope: 'whole', remaining: vaults, nextActive: null, deletedActive: false };
  },
  vaultReveal: async () => true,
  vaultRename: async () => null,
  vaultSelect: async () => null,
  vaultInit: async () => ({ ok: true, welcomeNoteId: 'a0' }),
  vaultSaveSettings: async () => {},
  noteCreate: async () => notesA[0],
  noteRead: async () => notesA[0],
  noteUpdate: async (id, patch) => ({ gid: id, ...patch }),
  noteDelete: async () => ({ ok: true }),
  linkCreate: async () => ({ link: {}, existed: false }),
  linkUpdate: async () => ({}),
  linkDelete: async () => ({ ok: true }),
  assetSave: async () => ({ relPath: 'x' }),
  pickImage: async () => null,
  clipboardReadImage: async () => null,
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
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' })
await page.waitForTimeout(6000)

const steps = []

// 1. 悬停第二项 → 出现 ×
await page.locator('.vault-item').nth(1).hover()
await page.waitForTimeout(300)
const hasRemove = await page.locator('.vault-remove').count()
steps.push({ step: 'hover-shows-delete', ok: hasRemove > 0 })

// 2. 点 × → 确认框
await page.locator('.vault-remove').first().click()
await page.waitForTimeout(500)
const dialog = await page.locator('.danger-title').count()
const title = await page.locator('.danger-title').innerText().catch(() => '')
steps.push({ step: 'confirm-dialog', ok: dialog > 0, title })
await page.screenshot({ path: 'preview-delete-vault.png' })

// 3. 取消 → 不调用删除
await page.locator('.modal-card .btn.ghost').click()
await page.waitForTimeout(400)
const stillTwo = await page.locator('.vault-item').count()
const calls0 = await page.evaluate(() => window.__CALLS__)
steps.push({
  step: 'cancel-keeps',
  ok: stillTwo === 2 && !calls0.some((c) => c.fn === 'vaultDelete'),
  stillTwo
})

// 4. 再点 × → 确认删除
await page.locator('.vault-item').nth(1).hover()
await page.waitForTimeout(250)
await page.locator('.vault-remove').first().click()
await page.waitForTimeout(400)
await page.locator('.modal-card .btn.danger').click()
await page.waitForTimeout(1200)
const calls1 = await page.evaluate(() => window.__CALLS__)
const deleted = calls1.some((c) => c.fn === 'vaultDelete' && c.path === 'C:/B')
const leftOne = await page.locator('.vault-item').count()
steps.push({ step: 'confirm-deletes', ok: deleted && leftOne === 1, deleted, leftOne })

await browser.close()
server.close()
console.log(JSON.stringify({ steps, errors }, null, 2))
process.exit(steps.every((s) => s.ok) && errors.length === 0 ? 0 : 1)
