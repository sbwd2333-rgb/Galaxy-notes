/** 专项：验证滚轮能否推拉镜头（规格书 §6 #8）。比较 wheel 前后的截图差异与星球像素尺寸。 */
import { createServer } from 'node:http'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { chromium } from 'playwright-core'

const root = path.join(process.cwd(), 'out', 'renderer')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

const mock = `
window.api = {
  vaultLoad: async () => ({ notes: Array.from({length: 6}, (_, i) => ({
    gid: 'g' + i, title: 'note ' + i, created: '2026-01-01T00:00:00Z', updated: '2026-01-01T00:00:00Z',
    color: ['#6ea8ff','#7ee0b8','#f5b971','#e07a9b','#b58cff','#5fd0e0'][i],
    pos: [Math.cos(i*1.2)*30, (i-2.5)*10, Math.sin(i*1.2)*30],
    doc: { type: 'doc', content: [{ type: 'paragraph' }] }, text: '' })), links: [], settings: {
    version: 1, vaultPath: 'x', lastNoteId: null, camera: { position: [0, 30, 100], target: [0,0,0] },
    window: { width: 1440, height: 900, maximized: false } }, corrupt: [] }),
  vaultSaveSettings: async () => {}, noteUpdate: async (id, p) => ({ gid: id, ...p }),
  onFlushRequest: () => () => {}, showContextMenu: async () => null
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
await page.waitForTimeout(5000)
await page.screenshot({ path: 'wheel-before.png' })

await page.mouse.move(720, 450)
for (let i = 0; i < 5; i++) {
  await page.mouse.wheel(0, -500)
  await page.waitForTimeout(150)
}
await page.waitForTimeout(1500)
await page.screenshot({ path: 'wheel-after.png' })

await browser.close()
server.close()
console.log(JSON.stringify({ errors }))
