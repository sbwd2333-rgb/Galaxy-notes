/**
 * 标题搜索冒烟：
 *  1) 侧边栏有搜索框
 *  2) 输入关键词 → 只列标题匹配的笔记，并高亮命中片段
 *  3) 点结果 → 进编辑器，且标题对得上
 *  4) 无匹配 → 显示空提示
 *  5) Esc 清空
 *
 * 用法：node scripts/search-test.mjs
 */
import { createServer } from 'node:http'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { chromium } from 'playwright-core'

const root = path.join(process.cwd(), 'out', 'renderer')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

const palette = ['#6ea8ff', '#7ee0b8', '#f5b971', '#e07a9b', '#b58cff', '#5fd0e0']

const mock = `
window.__CALLS__ = [];
const palette = ${JSON.stringify(palette)};
const titles = ['项目启动会', '项目复盘', '读书笔记：注意力', '读书笔记：时间', '给三年后的自己', '未命名的一条'];
const notes = titles.map((t, i) => {
  const y = 1 - (i / (titles.length - 1)) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = i * 2.399963;
  return {
    gid: 'gid' + i, title: t, created: '2026-11-20T10:00:00.000+08:00',
    updated: '2026-11-20T10:00:00.000+08:00', color: palette[i % palette.length],
    pos: [Math.cos(theta) * r * 62, y * 62 * 0.8, Math.sin(theta) * r * 62],
    doc: { type: 'doc', content: [{ type: 'paragraph', content: [{type:'text', text:'正文'}] }] }, text: '正文'
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
  noteUpdate: async (id, patch) => { const n = notes.find(x => x.gid === id); if (n) Object.assign(n, patch); return n ?? notes[0]; },
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
await page.waitForTimeout(6000)

const steps = []

steps.push({ step: 'search-box', ok: (await page.locator('.search-input').count()) > 0 })

// 1) 搜「读书笔记」→ 应命中 2 条
await page.fill('.search-input', '读书笔记')
await page.waitForTimeout(600)
const count1 = await page.locator('.search-result').count()
const marks = await page.locator('.result-title mark').count()
const titles1 = await page.locator('.result-title').allInnerTexts()
steps.push({
  step: 'filter-by-title',
  ok: count1 === 2 && titles1.every((t) => t.includes('读书笔记')),
  count1,
  titles1
})
steps.push({ step: 'highlight-match', ok: marks >= 2, marks })

// 2) 星系列表被搜索结果替换
const vaultItemsWhileSearching = await page.locator('.vault-item').count()
steps.push({ step: 'list-replaced', ok: vaultItemsWhileSearching === 0 })

// 3) 点第一条 → 进编辑器
await page.locator('.search-result').first().click()
await page.waitForTimeout(1600)
const card = await page.locator('.editor-card').count()
const noteTitle = await page.locator('.editor-title').inputValue().catch(() => '')
steps.push({ step: 'open-result', ok: card > 0 && noteTitle.includes('读书笔记'), card, noteTitle })
await page.screenshot({ path: 'preview-search.png' })

// 退出编辑器
await page.keyboard.press('Escape')
await page.waitForTimeout(900)

// 4) 无匹配
await page.fill('.search-input', 'zzzz')
await page.waitForTimeout(500)
const empty = await page.locator('.search-empty').count()
const zero = await page.locator('.search-result').count()
steps.push({ step: 'no-match', ok: empty > 0 && zero === 0 })

// 5) Esc 清空
await page.locator('.search-input').focus()
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
const queryAfter = await page.locator('.search-input').inputValue()
const vaultItemsBack = await page.locator('.vault-item').count()
steps.push({ step: 'esc-clears', ok: queryAfter === '' && vaultItemsBack > 0, queryAfter, vaultItemsBack })

await browser.close()
server.close()
console.log(JSON.stringify({ steps, errors }, null, 2))
process.exit(steps.every((s) => s.ok) && errors.length === 0 ? 0 : 1)
