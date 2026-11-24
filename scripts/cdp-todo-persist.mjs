/**
 * 待办持久化验证（真实 Electron，需要 --remote-debugging-port=9222）：
 *   add    : 加两条、勾一条，把 id 写到 scripts/.todo-ids.json
 *   verify : 重启后再读，确认两条都在且完成状态正确，然后清理掉
 */
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { chromium } from 'playwright-core'

const mode = process.argv[2] ?? 'add'
const idFile = path.join(process.cwd(), 'scripts', '.todo-ids.json')

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const pages = browser.contexts().flatMap((c) => c.pages())
const page = pages.find((p) => p.url().includes('renderer')) ?? pages[0]
if (!page) {
  console.log(JSON.stringify({ ok: false, reason: 'no page' }))
  process.exit(1)
}

if (mode === 'add') {
  const res = await page.evaluate(async () => {
    const before = await window.api.todosList()
    const a = await window.api.todosAdd('CDP 测试待办 A')
    const b = await window.api.todosAdd('CDP 测试待办 B')
    const toggled = await window.api.todosToggle(a.id)
    const after = await window.api.todosList()
    return {
      beforeCount: before.length,
      a,
      b,
      toggledDone: toggled?.done ?? null,
      after: after.map((t) => ({ id: t.id, text: t.text, done: t.done }))
    }
  })
  await fs.writeFile(idFile, JSON.stringify(res, null, 2), 'utf8')
  console.log(JSON.stringify({ mode, ...res }, null, 2))
} else {
  const saved = JSON.parse(await fs.readFile(idFile, 'utf8'))
  const res = await page.evaluate(async (ids) => {
    const list = await window.api.todosList()
    const mine = list.filter((t) => ids.includes(t.id))
    // 清理掉测试数据
    for (const t of mine) await window.api.todosRemove(t.id)
    const afterClean = await window.api.todosList()
    return {
      found: mine.map((t) => ({ id: t.id, text: t.text, done: t.done })),
      totalBefore: list.length,
      totalAfterClean: afterClean.length
    }
  }, [saved.a.id, saved.b.id])
  console.log(JSON.stringify({ mode, ...res }, null, 2))
  await fs.rm(idFile, { force: true })
}

await browser.close()
