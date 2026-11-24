/**
 * 右下角待办书签冒烟：
 *  1) 书签存在；点开出现面板
 *  2) 输入回车 → 列表多一条
 *  3) 勾选 → 变已完成（划掉）
 *  4) 点 × → 删除
 *  5) 清除已完成
 *  6) Esc 收起
 *
 * 用法：node scripts/todo-test.mjs
 */
import { createServer } from 'node:http'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { chromium } from 'playwright-core'

const root = path.join(process.cwd(), 'out', 'renderer')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

const mock = `
window.__CALLS__ = [];
let todos = [];
let seq = 0;
const notes = [{ gid: 'n1', title: '一篇笔记', text: 'x', color: '#6ea8ff', pos: [0,0,0], scale: 1,
  created: '2026-11-20T10:00:00.000+08:00', updated: '2026-11-20T10:00:00.000+08:00',
  doc: { type: 'doc', content: [{ type: 'paragraph' }] } }];
const settings = { version: 1, vaultPath: 'C:/mock', lastNoteId: null,
  camera: { position: [0, 40, 120], target: [0,0,0] }, window: { width: 1440, height: 900, maximized: false } };
window.api = {
  vaultLoad: async () => ({ notes, links: [], settings, corrupt: [] }),
  vaultList: async () => [{ path: 'C:/mock', name: '测试星系', noteCount: 1, active: true }],
  vaultCreate: async () => ({ ok: false, reason: 'cancelled' }),
  vaultSwitch: async () => null, vaultRemove: async () => [],
  vaultDelete: async () => ({ scope: 'whole', remaining: [], nextActive: null, deletedActive: false }),
  vaultReveal: async () => true, vaultRename: async () => null, vaultSelect: async () => null,
  vaultInit: async () => ({ ok: true, welcomeNoteId: 'n1' }), vaultCheckPath: async () => ({ ok: true }),
  vaultSaveSettings: async () => {},
  noteCreate: async () => notes[0], noteRead: async () => notes[0],
  noteUpdate: async (id, patch) => ({ ...notes[0], ...patch }), noteDelete: async () => ({ ok: true }),
  linkCreate: async () => ({ link: {}, existed: false }), linkUpdate: async () => ({}), linkDelete: async () => ({ ok: true }),
  assetSave: async () => ({ relPath: 'x' }), pickImage: async () => null, clipboardReadImage: async () => null,
  showContextMenu: async () => null,
  notify: async () => {}, writeClipboard: async () => {}, setWindowTitle: async () => {},
  readyToClose: () => {}, onFlushRequest: () => () => {},

  todosList: async () => todos.slice(),
  todosAdd: async (text) => {
    const t = { id: 't' + (++seq), text, done: false, createdAt: new Date().toISOString(), doneAt: null };
    todos.push(t);
    window.__CALLS__.push({ fn: 'add', text });
    return t;
  },
  todosToggle: async (id) => {
    const t = todos.find(x => x.id === id);
    if (!t) return null;
    t.done = !t.done;
    t.doneAt = t.done ? new Date().toISOString() : null;
    return t;
  },
  todosRemove: async (id) => { todos = todos.filter(x => x.id !== id); return todos; },
  todosClearDone: async () => { todos = todos.filter(x => !x.done); return todos; }
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
await page.emulateMedia({ reducedMotion: 'reduce' })
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' })
await page.waitForTimeout(5500)

const steps = []

steps.push({ step: 'bookmark-exists', ok: (await page.locator('.todo-bookmark').count()) === 1 })

await page.locator('.todo-bookmark').click()
await page.waitForTimeout(500)
steps.push({ step: 'opens-panel', ok: (await page.locator('.todo-panel').count()) === 1 })
steps.push({ step: 'empty-hint', ok: (await page.locator('.todo-empty').count()) === 1 })

// 加两条
for (const text of ['写周报', '给朋友发 demo']) {
  await page.fill('.todo-input', text)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
}
const count2 = await page.locator('.todo-item').count()
const addCalls = await page.evaluate(() => window.__CALLS__.filter((c) => c.fn === 'add'))
const itemTexts = await page.locator('.todo-item .todo-text').allInnerTexts()
steps.push({ step: 'add-items', ok: count2 === 2, count2, addCalls, itemTexts })

// 勾完成第一条
await page.locator('.todo-item').first().locator('.todo-check').click()
await page.waitForTimeout(400)
const doneCount = await page.locator('.todo-item.done').count()
const footText = await page.locator('.todo-count').innerText().catch(() => '')
steps.push({ step: 'toggle-done', ok: doneCount === 1 && footText.includes('1 项未完成'), doneCount, footText })
await page.screenshot({ path: 'preview-todo.png' })

// 删除未完成的那条（已完成会排到后面，先删第一条，留下 done 的给「清除已完成」用）
const before = await page.locator('.todo-item').count()
await page.locator('.todo-item').nth(0).locator('.todo-del').click()
await page.waitForTimeout(400)
const afterDel = await page.locator('.todo-item').count()
steps.push({ step: 'delete-item', ok: afterDel === before - 1, before, afterDel })

// 清除已完成
await page.locator('.todo-clear').click()
await page.waitForTimeout(400)
const afterClear = await page.locator('.todo-item').count()
steps.push({ step: 'clear-done', ok: afterClear === 0, afterClear })

// Esc 收起
await page.locator('.todo-input').click()
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
steps.push({ step: 'esc-closes', ok: (await page.locator('.todo-panel').count()) === 0 })

await browser.close()
server.close()
console.log(JSON.stringify({ steps, errors }, null, 2))
process.exit(steps.every((s) => s.ok) && errors.length === 0 ? 0 : 1)
