/**
 * 真实环境验证「删除星系」：建一个临时库 → 调 vaultDelete → 检查目录确实没了。
 * 需要应用以 --remote-debugging-port=9222 启动。
 */
import { createServer } from 'node:http'
import { promises as fs } from 'node:fs'
import { chromium } from 'playwright-core'

const TMP = 'C:/Users/19403/gn-temp-vault'

await fs.rm(TMP, { recursive: true, force: true })
await fs.mkdir(TMP, { recursive: true })
await fs.writeFile(`${TMP}/README-keep.txt`, 'user file', 'utf8')

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const contexts = browser.contexts()
const pages = contexts.flatMap((c) => c.pages())
const page = pages.find((p) => p.url().includes('renderer')) ?? pages[0]

const out = await page.evaluate(async (tmpPath) => {
  const before = await window.api.vaultList()
  const active = before.find((v) => v.active)?.path ?? null
  await window.api.vaultInit(tmpPath)
  const listed = await window.api.vaultList()
  const del = await window.api.vaultDelete(tmpPath)
  // 注意：不要切回 active——那个库可能刚被删掉，切回去会把目录重新注册
  const after = await window.api.vaultList()
  return { active, listed, del, after }
}, TMP)

await browser.close()

const tmpExists = await fs
  .stat(TMP)
  .then(() => true)
  .catch(() => false)
const leftovers = await fs.readdir(TMP).catch(() => [])
const vaultJsonLeft = await fs
  .stat(`${TMP}/vault.json`)
  .then(() => true)
  .catch(() => false)

console.log(
  JSON.stringify(
    {
      activeBefore: out.active,
      listedCount: out.listed.length,
      scope: out.del?.scope,
      deletedActive: out.del?.deletedActive,
      nextActive: out.del?.nextActive?.name ?? null,
      remaining: out.after.map((v) => v.name),
      tmpDirExistsAfter: tmpExists,
      leftovers,
      vaultJsonLeft
    },
    null,
    2
  )
)

const ok = out.del && out.del.scope === 'partial' && tmpExists && !vaultJsonLeft && leftovers.includes('README-keep.txt')
if (!ok) {
  console.log('NOTE: 目录里有用户文件时应走 partial（保留文件夹、只删星系数据）')
}
