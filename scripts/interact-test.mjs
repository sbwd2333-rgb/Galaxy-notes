/**
 * 交互冒烟：在 headless Chrome 里跑「悬停出标题 → 点进编辑 → 输入 → 自动保存 → Esc 缩回」。
 * 结果打印成 JSON，供人工核对；任何一步失败都会标出来。
 *
 * 用法：node scripts/interact-test.mjs
 */
import { createServer } from 'node:http'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { chromium } from 'playwright-core'

const root = path.join(process.cwd(), 'out', 'renderer')
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
}

const titles = [
  '欢迎来到星系',
  '关于注意力的一点观察',
  '读《人类简史》笔记',
  '产品直觉从哪里来',
  '深夜写下的失败复盘',
  '分布式系统里的权衡',
  '一个关于颜色的实验',
  '为什么我们记不住上周二',
  '无向关系与知识网络',
  '写作是最慢的思考',
  '设计稿第 12 版',
  '给三年后的自己'
]
const palette = ['#6ea8ff', '#7ee0b8', '#f5b971', '#e07a9b', '#b58cff', '#5fd0e0']

function buildMock() {
  const notes = titles.map((t, i) => {
    const n = titles.length
    const y = 1 - (i / (n - 1)) * 2
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = i * 2.399963
    const fixed = i % 3 !== 0
    return {
      gid: `gid${String(i).padStart(7, '0')}`,
      title: t,
      created: '2026-11-20T10:00:00.000+08:00',
      updated: '2026-11-20T10:00:00.000+08:00',
      color: palette[i % palette.length],
      pos: fixed ? [Math.cos(theta) * r * 62, y * 62 * 0.8, Math.sin(theta) * r * 62] : [0, 0, 0],
      doc: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '正文占位。' }] }]
      },
      text: '正文占位。'
    }
  })
  const links = [
    [0, 1, '同一问题的两面'],
    [1, 2, '互为前提'],
    [2, 3, '案例与理论'],
    [3, 4, '互相印证'],
    [4, 5, '同一线索'],
    [5, 6, '对照实验'],
    [7, 8, '概念相近'],
    [9, 10, '']
  ].map(([i, j, label], k) => ({
    id: `l_${k}`,
    a: notes[i].gid < notes[j].gid ? notes[i].gid : notes[j].gid,
    b: notes[i].gid < notes[j].gid ? notes[j].gid : notes[i].gid,
    label,
    origin: 'manual',
    created: '2026-11-20T10:00:00.000+08:00',
    aiRationale: null
  }))
  const settings = {
    version: 1,
    vaultPath: 'C:/mock/vault',
    lastNoteId: null,
    camera: { position: [0, 40, 120], target: [0, 0, 0] },
    window: { width: 1440, height: 900, maximized: false }
  }
  return `
window.__CALLS__ = [];
const notes = ${JSON.stringify(notes)};
const links = ${JSON.stringify(links)};
const settings = ${JSON.stringify(settings)};
window.__NOTES__ = notes;
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
    const n = { gid: 'new' + notes.length, title: '未命名笔记', created: new Date().toISOString(), updated: new Date().toISOString(), color: '#6ea8ff', pos: input.pos, doc: { type: 'doc', content: [{ type: 'paragraph' }] }, text: '' };
    notes.push(n); window.__CALLS__.push({ fn: 'noteCreate', pos: input.pos });
    return n;
  },
  noteRead: async (id) => notes.find((n) => n.gid === id),
  noteUpdate: async (id, patch) => {
    window.__CALLS__.push({ fn: 'noteUpdate', id, patch });
    const n = notes.find((x) => x.gid === id);
    if (n) Object.assign(n, patch);
    return n ?? notes[0];
  },
  noteDelete: async (id) => ({ ok: true }),
  linkCreate: async (input) => {
    window.__CALLS__.push({ fn: 'linkCreate', input });
    const l = { id: 'l_new', a: input.a, b: input.b, label: input.label, origin: 'manual', created: new Date().toISOString(), aiRationale: null };
    links.push(l);
    return { link: l, existed: false };
  },
  linkUpdate: async (id, label) => ({ id, label }),
  linkDelete: async () => ({ ok: true }),
  assetSave: async () => ({ relPath: 'assets/x/y.png' }),
  clipboardReadImage: async () => null,
  showContextMenu: async () => { window.__CALLS__.push({ fn: 'showContextMenu' }); return null; },
  notify: async () => {},
  writeClipboard: async () => {},
  setWindowTitle: async () => {},
  readyToClose: () => {},
  onFlushRequest: () => () => {}
};
`
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname === '/__mock.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
    res.end(buildMock())
    return
  }
  try {
    let rel = decodeURIComponent(url.pathname)
    if (rel === '/' || rel === '') rel = '/index.html'
    const abs = path.join(root, rel)
    if (!abs.startsWith(root)) {
      res.writeHead(403)
      res.end()
      return
    }
    let body = await fs.readFile(abs)
    if (rel === '/index.html') {
      body = Buffer.from(
        body.toString('utf8').replace('<head>', '<head><script src="/__mock.js"></script>'),
        'utf8'
      )
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(abs)] ?? 'application/octet-stream' })
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

const result = { steps: [], errors }

// 1. 悬停找星球（网格扫描，命中后 150ms 内应出现标题浮层）
let hit = null
outer: for (let y = 80; y < 860; y += 40) {
  for (let x = 80; x < 1400; x += 40) {
    await page.mouse.move(x, y)
    await page.waitForTimeout(180)
    const tip = await page.locator('.planet-tip').count()
    if (tip > 0) {
      hit = { x, y }
      break outer
    }
  }
}
result.steps.push({ step: 'hover-tip', ok: !!hit, hit })

if (hit) {
  // 2. 点进编辑
  await page.mouse.click(hit.x, hit.y)
  await page.waitForTimeout(900)
  const card = await page.locator('.editor-card').count()
  result.steps.push({ step: 'enter-editor', ok: card > 0 })
  await page.screenshot({ path: 'preview-editor.png' })

  // 3. 在正文里输入，触发自动保存
  if (card > 0) {
    const body = page.locator('.tiptap-body')
    await body.click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type('这是自动保存测试 ABC 123。')
    await page.waitForTimeout(1600)
    const calls = await page.evaluate(() => window.__CALLS__)
    const lastUpdate = [...calls].reverse().find((c) => c.fn === 'noteUpdate')
    result.steps.push({
      step: 'autosave',
      ok: !!lastUpdate && JSON.stringify(lastUpdate.patch.text ?? '').includes('自动保存测试'),
      lastUpdate: lastUpdate ? { id: lastUpdate.id, textLen: (lastUpdate.patch.text ?? '').length } : null
    })

    // 4. Esc 缩回
    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)
    const gone = await page.locator('.editor-card').count()
    result.steps.push({ step: 'escape-exit', ok: gone === 0 })
    await page.screenshot({ path: 'preview-back.png' })
  }
}

// 5. 右键空白应弹菜单（mock 返回 null，只验证调用发生且不报错）
const before = await page.evaluate(() => window.__CALLS__.length)
await page.mouse.click(1200, 780, { button: 'right' })
await page.waitForTimeout(600)
const after = await page.evaluate(() => window.__CALLS__)
result.steps.push({ step: 'blank-context-menu', ok: after.length > before })

// 6. 视图模型统计
result.state = await page.evaluate(() => ({
  planetTips: document.querySelectorAll('.planet-tip').length,
  canvas: document.querySelectorAll('canvas').length
}))

await browser.close()
server.close()
console.log(JSON.stringify(result, null, 2))
process.exit(result.steps.every((s) => s.ok) && errors.length === 0 ? 0 : 1)
