import { app } from 'electron'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'

/**
 * app 级指针：记住上次打开的是哪个库。
 * 规格书把库路径写在 vault.json 里，但启动时还没进库，得有个独立小文件指路。
 */
function pointerPath(): string {
  return path.join(app.getPath('userData'), 'last-vault.json')
}

export async function readLastVault(): Promise<string | null> {
  try {
    const raw = await fs.readFile(pointerPath(), 'utf8')
    const parsed = JSON.parse(raw) as { path?: string }
    if (typeof parsed.path !== 'string') return null
    const stat = await fs.stat(parsed.path)
    return stat.isDirectory() ? parsed.path : null
  } catch {
    return null
  }
}

export async function writeLastVault(vaultPath: string): Promise<void> {
  try {
    await fs.mkdir(path.dirname(pointerPath()), { recursive: true })
    const tmp = `${pointerPath()}.tmp`
    await fs.writeFile(tmp, JSON.stringify({ path: vaultPath }, null, 2), 'utf8')
    await fs.rename(tmp, pointerPath())
  } catch {
    /* 指针写不进去不影响主流程 */
  }
}
