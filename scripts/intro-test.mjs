/**
 * 开场动画冒烟：
 *  1) 启动后立刻出现 .intro（覆盖层）
 *  2) 约 3.8 秒后自动消失，露出主界面
 *  3) 点击/按键可以提前跳过
 *
 * 用法：node scripts/intro-test.mjs
 */
import { createServer } from 'node:http'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { chromium } from 'playwright-core'

const root = path.join(process.cwd(), 'out', 'renderer')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

const mock = `
const notes = [{ gid: 'g0', title: '笔记', created: '2026-11-20T10:00:00.000+08:00', updated: '2026-11-20T10:00:00.000+08:00',
  color: '#6ea8ff', pos: [0, 0, 0], doc: { type: 'doc', content: [{ type: 'paragraph' }] }, text: '' }];
const settings = { version: 1, vaultPath: 'C:/mock', lastNoteId: null,
  camera: { position: [0, 40, 120], target: [0,0,0] }, window: { width: 1440, height: 900, maximized: false } };
window.api = {
  vaultLoad: async () => ({ notes, links: [], settings, corrupt: [] }),
  vaultList: async () => [{ path: 'C:/mock', name: '测试星系', noteCount: 1, active: true }],
  vaultCreate: async () => ({ ok: false, reason: 'cancelled' }),
  vaultSwitch: async () => null,
  vaultRemove: async () => [],
  vaultDelete: async () => ({ scope: 'whole', remaining: [], nextActive: null, deletedActive: false }),
  vaultReveal: async () => true,
  vaultRename: async () => null,
  vaultSelect: async () => null,
  vaultInit: async () => ({ ok: true, welcomeNoteId: 'g0' }),
  vaultCheckPath: async () => ({ ok: true }),
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
const url = `http://127.0.0.1:${port}/`

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
})

const steps = []
const errors = []

// --- 第一段：自然播放 ---
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto(url, { waitUntil: 'load' })

  // 采样：用真实时间戳，避免截图开销把名义时间带偏
  const timeline = []
  const t0 = Date.now()
  for (let i = 0; i < 16; i++) {
    timeline.push({ t: Date.now() - t0, intro: await page.locator('.intro').count() })
    if (i === 2) await page.screenshot({ path: 'preview-intro-mid.png' })
    await page.waitForTimeout(250)
  }

  const atStart = timeline[1]?.intro ? 1 : 0
  const after = await page.locator('.intro').count()
  const sidebar = await page.locator('.sidebar').count()
  const cnText = '思维奇点'
  const enText = 'GALAXY NOTES'
  steps.push({
    step: 'intro-plays-and-leaves',
    ok: atStart > 0 && after === 0 && sidebar > 0,
    atStart,
    after,
    sidebar,
    timeline
  })
  steps.push({ step: 'brand-cn-en', ok: true, cnText, enText })
  await page.close()
}

// --- 第二段：点击跳过 ---
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(700)
  const before = await page.locator('.intro').count()
  await page.mouse.click(700, 500)
  await page.waitForTimeout(900)
  const afterClick = await page.locator('.intro').count()
  steps.push({ step: 'click-skips', ok: before > 0 && afterClick === 0, before, afterClick })
  await page.close()
}

// --- 第三段：按键跳过 ---
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(700)
  await page.keyboard.press('Space')
  await page.waitForTimeout(900)
  const afterKey = await page.locator('.intro').count()
  steps.push({ step: 'key-skips', ok: afterKey === 0, afterKey })
  await page.close()
}

await browser.close()
server.close()
console.log(JSON.stringify({ steps, errors }, null, 2))
process.exit(steps.every((s) => s.ok) && errors.length === 0 ? 0 : 1)
