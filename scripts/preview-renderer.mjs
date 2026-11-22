/**
 * 用系统 Chrome（headless）验证渲染层：起一个静态服务器伺服 out/renderer，
 * 注入 mock 的 window.api，截图并收集控制台错误。
 *
 * 为什么不用 Electron：当前沙箱里 Electron GUI 进程起不来（STATUS_BREAKPOINT），
 * 而 Chromium headless 可以跑 WebGL(SwiftShader)，足以验证 three/R3F/TipTap 不报错、画面出得来。
 *
 * 用法：node scripts/preview-renderer.mjs [输出png]
 */
import { createServer } from 'node:http'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { chromium } from 'playwright-core'

const root = path.join(process.cwd(), 'out', 'renderer')
const outPng = process.argv[2] ?? path.join(process.cwd(), 'preview.png')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json'
}

function mockScript() {
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
  const notes = titles.map((t, i) => {
    const n = titles.length
    const y = 1 - (i / (n - 1)) * 2
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = i * 2.399963
    const fixed = i % 3 !== 0
    const pos = fixed
      ? [Math.cos(theta) * r * 62, y * 62 * 0.8, Math.sin(theta) * r * 62]
      : [0, 0, 0]
    return {
      gid: `gid${String(i).padStart(7, '0')}`,
      title: t,
      created: '2026-11-20T10:00:00.000+08:00',
      updated: '2026-11-20T10:00:00.000+08:00',
      color: palette[i % palette.length],
      pos,
      doc: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: t }] },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '这是一段用于预览渲染的正文，验证 TipTap 与排版。' }]
          }
        ]
      },
      text: t
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
  const state = { notes, links }
  const settings = {
    version: 1,
    vaultPath: 'C:/mock/vault',
    lastNoteId: null,
    camera: { position: [0, 40, 120], target: [0, 0, 0] },
    window: { width: 1440, height: 900, maximized: false }
  }
  return `
window.__MOCK__ = true;
window.__ERRORS__ = [];
window.addEventListener('error', (e) => window.__ERRORS__.push(String(e.message)));
const notes = ${JSON.stringify(notes)};
const links = ${JSON.stringify(links)};
const settings = ${JSON.stringify(settings)};
window.api = {
  vaultSelect: async () => 'C:/mock/vault',
  vaultInit: async () => ({ ok: true, welcomeNoteId: notes[0].gid }),
  vaultLoad: async () => ({ notes, links, settings, corrupt: [] }),
  vaultList: async () => [
    { path: 'C:/mock/vault', name: '示例星系', noteCount: notes.length, active: true },
    { path: 'C:/mock/reading', name: '读书笔记', noteCount: 8, active: false }
  ],
  vaultCreate: async () => ({ ok: false, reason: 'cancelled' }),
  vaultSwitch: async () => ({ path: 'C:/mock/vault', name: '示例星系', noteCount: notes.length, active: true }),
  vaultRemove: async () => [],
  vaultReveal: async () => true,
  vaultRename: async () => null,
  vaultSaveSettings: async () => {},
  noteCreate: async (input) => {
    const n = { gid: 'new' + notes.length, title: '未命名笔记', created: new Date().toISOString(), updated: new Date().toISOString(), color: '#6ea8ff', pos: input.pos, doc: { type: 'doc', content: [{ type: 'paragraph' }] }, text: '' };
    notes.push(n);
    return n;
  },
  noteRead: async (id) => notes.find((n) => n.gid === id),
  noteUpdate: async (id, patch) => {
    const n = notes.find((x) => x.gid === id);
    if (n) Object.assign(n, patch);
    return n ?? notes[0];
  },
  noteDelete: async () => ({ ok: true }),
  linkCreate: async (input) => {
    const l = { id: 'l_new', a: input.a, b: input.b, label: input.label, origin: 'manual', created: new Date().toISOString(), aiRationale: null };
    links.push(l);
    return { link: l, existed: false };
  },
  linkUpdate: async (id, label) => { const l = links.find((x) => x.id === id); if (l) l.label = label; return l; },
  linkDelete: async () => ({ ok: true }),
  assetSave: async () => ({ relPath: 'assets/x/y.png' }),
  clipboardReadImage: async () => null,
  showContextMenu: async () => null,
  notify: async () => {},
  writeClipboard: async () => {},
  setWindowTitle: async () => {},
  readyToClose: () => {},
  onFlushRequest: () => () => {}
};
`
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname === '/__mock.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
      res.end(mockScript())
      return
    }
    let rel = decodeURIComponent(url.pathname)
    if (rel === '/' || rel === '') rel = '/index.html'
    const abs = path.join(root, rel)
    if (!abs.startsWith(root)) {
      res.writeHead(403)
      res.end('forbidden')
      return
    }
    let body = await fs.readFile(abs)
    if (rel === '/index.html') {
      const html = body.toString('utf8')
      body = Buffer.from(html.replace('<head>', '<head><script src="/__mock.js"></script>'), 'utf8')
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(abs)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404)
    res.end('not found')
  }
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const url = `http://127.0.0.1:${port}/`
console.log('[preview] serving', url)

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox']
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })

const logs = []
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))

await page.goto(url, { waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(7000)

const info = await page.evaluate(() => {
  const canvas = document.querySelector('canvas')
  const gl = canvas ? (canvas.getContext('webgl2') || canvas.getContext('webgl')) : null
  return {
    canvases: document.querySelectorAll('canvas').length,
    canvasSize: canvas ? [canvas.width, canvas.height] : null,
    gl: gl ? 'ok' : 'none',
    tips: document.querySelectorAll('.planet-tip').length,
    errs: window.__ERRORS__ ?? [],
    bodyText: (document.body.innerText || '').slice(0, 200)
  }
})

await page.screenshot({ path: outPng })

// 再拉近镜头截一张，用来检查星球纹理与光晕（远景只能看到小点）
await page.mouse.move(720, 450)
for (let i = 0; i < 6; i++) {
  await page.mouse.wheel(0, -600)
  await page.waitForTimeout(120)
}
await page.waitForTimeout(2500)
const zoomPng = outPng.replace(/\.png$/, '-zoom.png')
await page.screenshot({ path: zoomPng })

await browser.close()
server.close()

console.log('[preview] info', JSON.stringify(info, null, 2))
console.log('[preview] console:')
for (const l of logs.slice(-40)) console.log('  ' + l)
console.log('[preview] screenshot ->', outPng, 'and', zoomPng)
