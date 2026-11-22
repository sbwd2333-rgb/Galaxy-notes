/**
 * 路径护栏（真实 Electron）：直接调 window.api.vaultCheckPath 检查几种目录。
 * 需要应用以 --remote-debugging-port=9222 启动。
 */
import { chromium } from 'playwright-core'

const cases = [
  { path: 'C:\\', expect: false, label: '磁盘根' },
  { path: 'C:\\Users\\19403', expect: false, label: '用户主目录' },
  { path: 'C:\\Users\\19403\\Desktop', expect: false, label: '桌面（系统一级）' },
  { path: 'C:\\Users\\19403\\Pictures', expect: false, label: '图片（系统一级）' },
  { path: 'C:\\Users\\19403\\Downloads', expect: false, label: '下载（系统一级）' },
  { path: 'C:\\Users\\19403\\Documents', expect: false, label: '文档（系统一级）' },
  { path: 'C:\\Users\\19403\\AppData\\Roaming', expect: false, label: 'AppData' },
  { path: 'C:\\Windows', expect: false, label: '系统目录' },
  { path: 'C:\\Users\\19403\\Desktop\\美学积累', expect: true, label: '桌面下的子目录' },
  { path: 'C:\\Users\\19403\\GalaxyNotes', expect: true, label: '主目录下自建目录' },
  { path: 'C:\\Users\\19403\\Documents\\笔记', expect: true, label: '文档下的子目录' },
  { path: 'D:\\Notes', expect: true, label: '其它盘符的目录' }
]

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const pages = browser.contexts().flatMap((c) => c.pages())
const page = pages.find((p) => p.url().includes('renderer')) ?? pages[0]
if (!page) {
  console.log(JSON.stringify({ ok: false, reason: 'no page' }))
  process.exit(1)
}

const results = await page.evaluate(async (cases) => {
  const out = []
  for (const c of cases) {
    const r = await window.api.vaultCheckPath(c.path)
    out.push({ ...c, got: r.ok, message: r.message ?? null })
  }
  return out
}, cases)

await browser.close()

let failed = 0
for (const r of results) {
  const ok = r.got === r.expect
  if (!ok) failed++
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${r.label.padEnd(18)} ${r.path.padEnd(38)} => ${r.got ? '允许' : '拒绝'}` +
      (r.message ? `  (${r.message.slice(0, 40)}…)` : '')
  )
}
console.log(JSON.stringify({ ok: failed === 0, failed, total: results.length }))
process.exit(failed === 0 ? 0 : 1)
