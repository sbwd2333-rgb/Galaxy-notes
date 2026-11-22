/**
 * 关联与新建冒烟：
 *  1) Ctrl+左键选中两颗星球 → 右键出现「建立关联…」→ 模态 → 输入标签 → 建立连线
 *  2) 右键空白新建笔记 → 直接进入编辑态，笔记落在鼠标投影附近
 *
 * 菜单返回值由 mock 的 window.__NEXT_MENU__ 控制（Electron 原生 Menu 无法在浏览器里点）。
 *
 * 用法：node scripts/link-test.mjs
 */
import { createServer } from 'node:http'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { chromium } from 'playwright-core'

const root = path.join(process.cwd(), 'out', 'renderer')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

const titles = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸', '子', '丑']
const palette = ['#6ea8ff', '#7ee0b8', '#f5b971', '#e07a9b', '#b58cff', '#5fd0e0']

function mock() {
  const notes = titles.map((t, i) => {
    const y = 1 - (i / (titles.length - 1)) * 2
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = i * 2.399963
    return {
      gid: `gid${String(i).padStart(7, '0')}`,
      title: `笔记${t}`,
      created: '2026-11-20T10:00:00.000+08:00',
      updated: '2026-11-20T10:00:00.000+08:00',
      color: palette[i % palette.length],
      pos: [Math.cos(theta) * r * 62, y * 62 * 0.8, Math.sin(theta) * r * 62],
      doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] },
      text: t
    }
  })
  const links = []
  const settings = {
    version: 1,
    vaultPath: 'C:/mock/vault',
    lastNoteId: null,
    camera: { position: [0, 40, 120], target: [0, 0, 0] },
    window: { width: 1440, height: 900, maximized: false }
  }
  return `
window.__CALLS__ = [];
window.__NEXT_MENU__ = null;
window.__LINKS__ = ${JSON.stringify(links)};
const notes = ${JSON.stringify(notes)};
const links = window.__LINKS__;
const settings = ${JSON.stringify(settings)};
window.api = {
  vaultSelect: async () => 'C:/mock/vault',
  vaultInit: async () => ({ ok: true, welcomeNoteId: notes[0].gid }),
  vaultLoad: async () => ({ notes, links, settings, corrupt: [] }),
  vaultList: async () => [{ path: 'C:/mock/vault', name: '测试星系', noteCount: notes.length, active: true }],
  vaultCreate: async () => ({ ok: false, reason: 'cancelled' }),
  vaultSwitch: async () => ({ path: 'C:/mock/vault', name: '测试星系', noteCount: notes.length, active: true }),
  vaultRemove: async () => [],
  vaultReveal: async () => true,
  vaultRename: async () => null,
  vaultSaveSettings: async () => {},
  noteCreate: async (input) => {
    const n = { gid: 'new001', title: '未命名笔记', created: new Date().toISOString(), updated: new Date().toISOString(), color: '#6ea8ff', pos: input.pos, doc: { type: 'doc', content: [{ type: 'paragraph' }] }, text: '' };
    notes.push(n);
    window.__CALLS__.push({ fn: 'noteCreate', pos: input.pos });
    return n;
  },
  noteRead: async (id) => notes.find((n) => n.gid === id),
  noteUpdate: async (id, patch) => { const n = notes.find((x) => x.gid === id); if (n) Object.assign(n, patch); return n ?? notes[0]; },
  noteDelete: async () => ({ ok: true }),
  linkCreate: async (input) => {
    const l = { id: 'l_new', a: input.a, b: input.b, label: input.label, origin: 'manual', created: new Date().toISOString(), aiRationale: null };
    links.push(l);
    window.__CALLS__.push({ fn: 'linkCreate', a: input.a, b: input.b, label: input.label });
    return { link: l, existed: false };
  },
  linkUpdate: async (id, label) => ({ id, label }),
  linkDelete: async () => ({ ok: true }),
  assetSave: async () => ({ relPath: 'assets/x/y.png' }),
  clipboardReadImage: async () => null,
  showContextMenu: async (payload) => {
    window.__CALLS__.push({ fn: 'showContextMenu', items: payload.items.map((i) => i.id) });
    return window.__NEXT_MENU__;
  },
  notify: async () => {}, writeClipboard: async () => {}, setWindowTitle: async () => {},
  readyToClose: () => {}, onFlushRequest: () => () => {}
};
`
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname === '/__mock.js') {
    res.writeHead(200, { 'content-type': 'text/javascript' })
    res.end(mock())
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

const steps = []

// ---- 找两颗相距较远的星球 ----
const found = []
for (let y = 60; y < 860 && found.length < 2; y += 50) {
  for (let x = 60; x < 1400 && found.length < 2; x += 50) {
    await page.mouse.move(x, y)
    await page.waitForTimeout(160)
    if ((await page.locator('.planet-tip').count()) > 0) {
      if (!found.some((p) => Math.hypot(p.x - x, p.y - y) < 120)) found.push({ x, y })
    }
  }
}
steps.push({ step: 'find-planets', ok: found.length === 2, found })
await page.mouse.move(5, 895)
await page.waitForTimeout(200)

if (found.length === 2) {
  // ---- Ctrl 多选 ----
  await page.keyboard.down('Control')
  await page.mouse.click(found[0].x, found[0].y)
  await page.waitForTimeout(250)
  await page.mouse.click(found[1].x, found[1].y)
  await page.keyboard.up('Control')
  await page.waitForTimeout(400)
  const hint = await page.locator('.selection-hint').count()
  steps.push({ step: 'ctrl-select', ok: hint > 0 })

  // ---- 右键 → 建立关联 ----
  await page.evaluate(() => (window.__NEXT_MENU__ = 'make-link'))
  await page.mouse.click(found[1].x, found[1].y, { button: 'right' })
  await page.waitForTimeout(700)
  const menuItems = await page.evaluate(
    () => window.__CALLS__.filter((c) => c.fn === 'showContextMenu').at(-1)?.items ?? []
  )
  const modal = await page.locator('.link-row').count()
  steps.push({ step: 'link-menu-items', ok: menuItems.includes('make-link'), menuItems })
  steps.push({ step: 'link-modal-open', ok: modal > 0 })
  await page.screenshot({ path: 'preview-link-modal.png' })

  if (modal > 0) {
    await page.fill('.modal-card .text-input', '同一问题的两面')
    await page.click('.modal-card .btn.primary')
    await page.waitForTimeout(900)
    const created = await page.evaluate(
      () => window.__CALLS__.filter((c) => c.fn === 'linkCreate').at(-1) ?? null
    )
    steps.push({
      step: 'link-created',
      ok: !!created && created.label === '同一问题的两面',
      created
    })
    await page.screenshot({ path: 'preview-link-done.png' })
  }
}

// ---- 右键空白新建 ----
await page.evaluate(() => (window.__NEXT_MENU__ = 'new-note'))
await page.mouse.click(1180, 780, { button: 'right' })
await page.waitForTimeout(1200)
const editor = await page.locator('.editor-card').count()
const created = await page.evaluate(() => window.__CALLS__.filter((c) => c.fn === 'noteCreate').at(-1) ?? null)
const posOk =
  !!created &&
  Array.isArray(created.pos) &&
  (Math.abs(created.pos[0]) > 0.001 || Math.abs(created.pos[1]) > 0.001)
steps.push({ step: 'new-note-enters-editor', ok: editor > 0 })
steps.push({ step: 'new-note-pos', ok: posOk, pos: created?.pos ?? null })

await browser.close()
server.close()
console.log(JSON.stringify({ steps, errors }, null, 2))
process.exit(steps.every((s) => s.ok) && errors.length === 0 ? 0 : 1)
