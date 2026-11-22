/** 只截开场动画：加载页面 → 等 2.4 秒（品牌名清晰、粒子已铺开）→ 截图。 */
import { createServer } from 'node:http'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { chromium } from 'playwright-core'

const root = path.join(process.cwd(), 'out', 'renderer')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

const mock = `
const settings = { version: 1, vaultPath: 'C:/mock', lastNoteId: null,
  camera: { position: [0, 40, 120], target: [0,0,0] }, window: { width: 1440, height: 900, maximized: false } };
window.api = {
  vaultLoad: async () => ({ notes: [], links: [], settings, corrupt: [] }),
  vaultList: async () => [{ path: 'C:/mock', name: '测试星系', noteCount: 0, active: true }],
  vaultCreate: async () => ({ ok: false, reason: 'cancelled' }),
  vaultSwitch: async () => null, vaultRemove: async () => [], vaultDelete: async () => ({}),
  vaultReveal: async () => true, vaultRename: async () => null, vaultSelect: async () => null,
  vaultInit: async () => ({ ok: true, welcomeNoteId: 'g0' }), vaultCheckPath: async () => ({ ok: true }),
  vaultSaveSettings: async () => {}, noteCreate: async () => ({}), noteRead: async () => ({}),
  noteUpdate: async () => ({}), noteDelete: async () => ({ ok: true }),
  linkCreate: async () => ({ link: {}, existed: false }), linkUpdate: async () => ({}),
  linkDelete: async () => ({ ok: true }), assetSave: async () => ({ relPath: 'x' }),
  pickImage: async () => null, clipboardReadImage: async () => null,
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
await page.emulateMedia({ reducedMotion: 'no-preference' })
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' })
await page.waitForTimeout(2400)
await page.screenshot({ path: process.argv[2] ?? 'preview-intro.png' })
await browser.close()
server.close()
console.log('shot ok')
