/**
 * 侧边栏（多星系）冒烟：
 *  1) 侧边栏渲染出两个星系，当前那个高亮
 *  2) 点另一个星系 → 调 vaultSwitch → 重新加载 → 高亮切换
 *  3) 点「新建星系」→ 调 vaultCreate
 *
 * 用法：node scripts/sidebar-test.mjs
 */
import { createServer } from 'node:http'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { chromium } from 'playwright-core'

const root = path.join(process.cwd(), 'out', 'renderer')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

const palette = ['#6ea8ff', '#7ee0b8', '#f5b971', '#e07a9b', '#b58cff', '#5fd0e0']

function notesFor(prefix, n) {
  return Array.from({ length: n }, (_, i) => {
    const y = 1 - (i / Math.max(1, n - 1)) * 2
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = i * 2.399963
    return {
      gid: `${prefix}${i}`,
      title: `${prefix} 的第 ${i + 1} 篇`,
      created: '2026-11-20T10:00:00.000+08:00',
      updated: '2026-11-20T10:00:00.000+08:00',
      color: palette[i % palette.length],
      pos: [Math.cos(theta) * r * 50, y * 50, Math.sin(theta) * r * 50],
      doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] },
      text: 'x'
    }
  })
}

const mock = `
window.__CALLS__ = [];
let current = 'A';
const data = {
  A: { notes: ${JSON.stringify(notesFor('a', 3))}, links: [] },
  B: { notes: ${JSON.stringify(notesFor('b', 5))}, links: [] }
};
window.__COUNT__ = () => data[current].notes.length;
const settings = { version: 1, vaultPath: 'C:/A', lastNoteId: null,
  camera: { position: [0, 40, 120], target: [0,0,0] }, window: { width: 1440, height: 900, maximized: false } };
window.api = {
  vaultLoad: async () => ({ notes: data[current].notes, links: data[current].links, settings, corrupt: [] }),
  vaultList: async () => [
    { path: 'C:/A', name: '星系 A', noteCount: data.A.notes.length, active: current === 'A' },
    { path: 'C:/B', name: '星系 B', noteCount: data.B.notes.length, active: current === 'B' }
  ],
  vaultSwitch: async (p) => {
    window.__CALLS__.push({ fn: 'vaultSwitch', path: p });
    current = p === 'C:/B' ? 'B' : 'A';
    return { path: p, name: current === 'A' ? '星系 A' : '星系 B', noteCount: data[current].notes.length, active: true };
  },
  vaultCreate: async () => { window.__CALLS__.push({ fn: 'vaultCreate' }); return null; },
  vaultRemove: async () => [],
  vaultReveal: async () => true,
  vaultSelect: async () => null,
  vaultInit: async () => ({ ok: true, welcomeNoteId: 'a0' }),
  vaultSaveSettings: async () => {},
  noteCreate: async (i) => ({ gid: 'new', title: '未命名笔记', created: '', updated: '', color: '#6ea8ff', pos: i.pos, doc: { type: 'doc', content: [] }, text: '' }),
  noteRead: async () => null,
  noteUpdate: async (id, patch) => ({ gid: id, ...patch }),
  noteDelete: async () => ({ ok: true }),
  linkCreate: async () => ({ link: {}, existed: false }),
  linkUpdate: async () => ({}),
  linkDelete: async () => ({ ok: true }),
  assetSave: async () => ({ relPath: 'x' }),
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
        body.toString('utf8').replace('<head>', '<head><script src="/__mock.js"></script>'),
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

const side = await page.locator('.sidebar').count()
const items = await page.locator('.vault-item').count()
const activeName = await page.locator('.vault-item.on .vault-name').innerText().catch(() => '')
const countBefore = await page.evaluate(() => window.__COUNT__())
steps.push({ step: 'sidebar-rendered', ok: side > 0 && items === 2, items, activeName, countBefore })
await page.screenshot({ path: 'preview-sidebar-a.png' })

// 切到 B
await page.locator('.vault-item').nth(1).locator('.vault-main').click()
await page.waitForTimeout(1500)
const calls = await page.evaluate(() => window.__CALLS__)
const switched = calls.some((c) => c.fn === 'vaultSwitch' && c.path === 'C:/B')
const activeName2 = await page.locator('.vault-item.on .vault-name').innerText().catch(() => '')
const countAfter = await page.evaluate(() => window.__COUNT__())
steps.push({
  step: 'switch-vault',
  ok: switched && activeName2 === '星系 B' && countAfter === 5,
  activeName2,
  countAfter
})
await page.screenshot({ path: 'preview-sidebar-b.png' })

// 新建星系
await page.locator('.new-vault-btn').click()
await page.waitForTimeout(800)
const calls2 = await page.evaluate(() => window.__CALLS__)
steps.push({ step: 'create-vault-called', ok: calls2.some((c) => c.fn === 'vaultCreate') })

await browser.close()
server.close()
console.log(JSON.stringify({ steps, errors }, null, 2))
process.exit(steps.every((s) => s.ok) && errors.length === 0 ? 0 : 1)
