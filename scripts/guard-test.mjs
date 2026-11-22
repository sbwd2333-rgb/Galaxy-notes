/**
 * 路径护栏（渲染层）：新建星系时被主进程拦下 → 侧边栏弹 toast 说明原因。
 * 用法：node scripts/guard-test.mjs
 */
import { createServer } from 'node:http'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { chromium } from 'playwright-core'

const root = path.join(process.cwd(), 'out', 'renderer')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const BLOCK_MSG =
  '「Desktop」是主目录下的一级文件夹，里面通常还有别的东西，不适合当星系库。请在它里面新建一个子文件夹（比如 Desktop\\星系笔记）再选。'

const mock = `
window.__CALLS__ = [];
const notes = [{ gid: 'g0', title: '笔记', created: '2026-11-20T10:00:00.000+08:00', updated: '2026-11-20T10:00:00.000+08:00',
  color: '#6ea8ff', pos: [0, 0, 0], doc: { type: 'doc', content: [{ type: 'paragraph' }] }, text: '' }];
const settings = { version: 1, vaultPath: 'C:/mock', lastNoteId: null,
  camera: { position: [0, 40, 120], target: [0,0,0] }, window: { width: 1440, height: 900, maximized: false } };
window.api = {
  vaultLoad: async () => ({ notes, links: [], settings, corrupt: [] }),
  vaultList: async () => [{ path: 'C:/mock', name: '现有星系', noteCount: 1, active: true }],
  vaultCreate: async () => { window.__CALLS__.push({ fn: 'vaultCreate' }); return { ok: false, reason: 'blocked', message: ${JSON.stringify(BLOCK_MSG)} }; },
  vaultSwitch: async () => null,
  vaultRemove: async () => [],
  vaultDelete: async () => ({ scope: 'whole', remaining: [], nextActive: null, deletedActive: false }),
  vaultReveal: async () => true,
  vaultRename: async () => null,
  vaultSelect: async () => null,
  vaultInit: async () => ({ ok: false, message: 'blocked' }),
  vaultCheckPath: async () => ({ ok: false, message: 'blocked' }),
  vaultSaveSettings: async () => {},
  noteCreate: async () => notes[0],
  noteRead: async () => notes[0],
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
await page.waitForTimeout(5000)

const steps = []

await page.locator('.new-vault-btn').click()
await page.waitForTimeout(900)

const calls = await page.evaluate(() => window.__CALLS__)
const toastText = await page.locator('.toast').innerText().catch(() => '')
const toastIsError = (await page.locator('.toast-error').count()) > 0
const vaultCount = await page.locator('.vault-item').count()

steps.push({ step: 'create-called', ok: calls.some((c) => c.fn === 'vaultCreate') })
steps.push({
  step: 'blocked-toast',
  ok: toastText.includes('一级文件夹') && toastIsError,
  toastText,
  toastIsError
})
steps.push({ step: 'list-unchanged', ok: vaultCount === 1, vaultCount })
await page.screenshot({ path: 'preview-guard.png' })

await browser.close()
server.close()
console.log(JSON.stringify({ steps, errors }, null, 2))
process.exit(steps.every((s) => s.ok) && errors.length === 0 ? 0 : 1)
