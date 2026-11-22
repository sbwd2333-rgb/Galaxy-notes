/** 首次启动（库里还没有库）时的引导页截图与断言。用法：node scripts/welcome-shot.mjs */
import { createServer } from 'node:http'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { chromium } from 'playwright-core'

const root = path.join(process.cwd(), 'out', 'renderer')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const mock = `
window.api = {
  vaultLoad: async () => { throw new Error('NO_VAULT'); },
  vaultSelect: async () => null,
  vaultInit: async () => ({ ok: true, welcomeNoteId: 'x' }),
  onFlushRequest: () => () => {}, showContextMenu: async () => null,
  noteUpdate: async () => ({}), vaultSaveSettings: async () => {}
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
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' })
await page.waitForTimeout(2500)
const welcome = await page.locator('.welcome').count()
const headline = await page.locator('.welcome-title').innerText().catch(() => '')
await page.screenshot({ path: 'preview-welcome.png' })
await browser.close()
server.close()
console.log(JSON.stringify({ welcome, headline, errors }, null, 2))
process.exit(welcome > 0 && errors.length === 0 ? 0 : 1)
