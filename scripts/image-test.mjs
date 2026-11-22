/**
 * 图片插入冒烟：
 *  1) 编辑器右上角「图片」按钮 → 调 pickImage → 插入 image 节点
 *  2) image 节点的 src 必须被转成 asset://local/...（不能是本地绝对路径）
 *  3) 粘贴事件里带图片文件 → 走 assetSave 并插入
 *
 * 用法：node scripts/image-test.mjs
 */
import { createServer } from 'node:http'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { chromium } from 'playwright-core'

const root = path.join(process.cwd(), 'out', 'renderer')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

const palette = ['#6ea8ff', '#7ee0b8', '#f5b971', '#e07a9b', '#b58cff', '#5fd0e0']
const titles = ['甲', '乙', '丙', '丁', '戊', '己']

const mock = `
window.__CALLS__ = [];
const palette = ${JSON.stringify(palette)};
const titles = ${JSON.stringify(titles)};
const notes = titles.map((t, i) => {
  const y = 1 - (i / (titles.length - 1)) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = i * 2.399963;
  return {
    gid: 'gid' + i, title: '笔记' + t, created: '2026-11-20T10:00:00.000+08:00',
    updated: '2026-11-20T10:00:00.000+08:00', color: palette[i % palette.length],
    pos: [Math.cos(theta) * r * 62, y * 62 * 0.8, Math.sin(theta) * r * 62],
    doc: { type: 'doc', content: [{ type: 'paragraph' }] }, text: ''
  };
});
const settings = { version: 1, vaultPath: 'C:/mock/vault', lastNoteId: null,
  camera: { position: [0, 40, 120], target: [0,0,0] }, window: { width: 1440, height: 900, maximized: false } };
window.api = {
  vaultLoad: async () => ({ notes, links: [], settings, corrupt: [] }),
  vaultList: async () => [{ path: 'C:/mock/vault', name: '测试星系', noteCount: notes.length, active: true }],
  vaultCreate: async () => ({ ok: false, reason: 'cancelled' }),
  vaultSwitch: async () => null,
  vaultRemove: async () => [],
  vaultReveal: async () => true,
  vaultRename: async () => null,
  vaultSelect: async () => null,
  vaultInit: async () => ({ ok: true, welcomeNoteId: 'gid0' }),
  vaultSaveSettings: async () => {},
  noteCreate: async (i) => notes[0],
  noteRead: async (id) => notes.find(n => n.gid === id),
  noteUpdate: async (id, patch) => { window.__CALLS__.push({ fn: 'noteUpdate', id }); const n = notes.find(x => x.gid === id); if (n) Object.assign(n, patch); return n ?? notes[0]; },
  noteDelete: async () => ({ ok: true }),
  linkCreate: async () => ({ link: {}, existed: false }),
  linkUpdate: async () => ({}),
  linkDelete: async () => ({ ok: true }),
  assetSave: async (input) => { window.__CALLS__.push({ fn: 'assetSave', size: input.data.byteLength, ext: input.ext }); return { relPath: 'assets/gid0/pasted.png' }; },
  pickImage: async (noteId) => { window.__CALLS__.push({ fn: 'pickImage', noteId }); return { relPath: 'assets/gid0/picked.png' }; },
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
await page.waitForTimeout(5500)
await page.screenshot({ path: 'preview-image-stage.png' })

const steps = []

// 找一颗星球点进去（mock 布局是确定的，直接试几个已知落点，失败再稀疏扫描）
const candidates = [
  [465, 267],
  [838, 80],
  [862, 313],
  [542, 600],
  [838, 735],
  [1215, 705]
]
let hit = null
for (const [x, y] of candidates) {
  await page.mouse.move(x, y)
  await page.waitForTimeout(220)
  if ((await page.locator('.planet-tip').count()) > 0) {
    hit = { x, y }
    break
  }
}
if (!hit) {
  outer: for (let y = 100; y < 860; y += 30) {
    for (let x = 300; x < 1400; x += 30) {
      await page.mouse.move(x, y)
      await page.waitForTimeout(170)
      if ((await page.locator('.planet-tip').count()) > 0) {
        hit = { x, y }
        break outer
      }
    }
  }
}
steps.push({ step: 'find-planet', ok: !!hit, hit })
await page.mouse.move(5, 895)
await page.waitForTimeout(200)

if (hit) {
  await page.mouse.click(hit.x, hit.y)
  await page.waitForTimeout(900)
  const card = await page.locator('.editor-card').count()
  steps.push({ step: 'enter-editor', ok: card > 0 })

  if (card > 0) {
    const tool = await page.locator('.editor-tool').count()
    steps.push({ step: 'image-button-exists', ok: tool > 0 })

    // 1) 点按钮
    await page.locator('.editor-tool').click()
    await page.waitForTimeout(900)
    const calls = await page.evaluate(() => window.__CALLS__)
    const picked = calls.some((c) => c.fn === 'pickImage')
    const imgCount = await page.locator('.tiptap-body img').count()
    const src = await page.locator('.tiptap-body img').first().getAttribute('src').catch(() => null)
    steps.push({ step: 'pick-image-inserts', ok: picked && imgCount === 1 && !!src, imgCount, src })
    steps.push({
      step: 'src-uses-asset-protocol',
      ok: typeof src === 'string' && src.startsWith('asset://local/assets/gid0/'),
      src
    })

    // 2) 粘贴一张图
    const pasted = await page.evaluate(async () => {
      // 1x1 png
      const b64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const file = new File([bytes], 'pasted.png', { type: 'image/png' })
      const dt = new DataTransfer()
      dt.items.add(file)
      const body = document.querySelector('.tiptap-body')
      if (!body) return { ok: false, reason: 'no body' }
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
      body.dispatchEvent(ev)
      return { ok: true, files: dt.files.length }
    })
    await page.waitForTimeout(1200)
    const imgCount2 = await page.locator('.tiptap-body img').count()
    const calls2 = await page.evaluate(() => window.__CALLS__)
    const saved = calls2.some((c) => c.fn === 'assetSave')
    const html = await page.locator('.tiptap-body').innerHTML().catch(() => '')
    const toast = await page.locator('.toast').innerText().catch(() => '')
    steps.push({
      step: 'paste-image',
      ok: pasted.ok && saved && imgCount2 >= 2,
      pasted,
      saved,
      imgCount2,
      html: html.slice(0, 300),
      toast
    })
    await page.screenshot({ path: 'preview-image.png' })
  }
}

await browser.close()
server.close()
// asset:// 只有 Electron 认识，headless Chrome 里必然报 ERR_UNKNOWN_URL_SCHEME，不算应用错误
const realErrors = errors.filter((e) => !e.includes('ERR_UNKNOWN_URL_SCHEME'))
console.log(JSON.stringify({ steps, errors: realErrors }, null, 2))
process.exit(steps.every((s) => s.ok) && realErrors.length === 0 ? 0 : 1)
