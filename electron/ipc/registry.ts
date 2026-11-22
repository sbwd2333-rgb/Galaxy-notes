import { app } from 'electron'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { readLastVault, writeLastVault } from './pointer'
import type { VaultItem } from '../../shared/types'

/**
 * 星系清单（多库）。
 *
 * 规格书的 P1 才有多库切换，这里按用户要求提前做了：
 * 记住打开过的每个库、当前是哪一个，供左侧侧边栏展示与切换。
 * 存在 userData/vaults.json；旧的 last-vault.json 会被自动迁移成第一项。
 */

export interface VaultEntry {
  path: string
  name: string
  lastOpened: string
  noteCount: number
}

interface RegistryFile {
  version: 1
  items: VaultEntry[]
  activePath: string | null
}

function registryPath(): string {
  return path.join(app.getPath('userData'), 'vaults.json')
}

async function atomicWriteJson(abs: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(abs), { recursive: true })
  const tmp = `${abs}.tmp-${Date.now()}`
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await fs.rename(tmp, abs)
}

function normalizeName(p: string): string {
  const base = path.basename(p)
  return base || p
}

async function countNotes(vaultPath: string): Promise<number> {
  try {
    const files = await fs.readdir(path.join(vaultPath, 'notes'))
    return files.filter((f) => f.endsWith('.json')).length
  } catch {
    return 0
  }
}

async function dirExists(p: string): Promise<boolean> {
  try {
    const st = await fs.stat(p)
    return st.isDirectory()
  } catch {
    return false
  }
}

export async function readRegistry(): Promise<RegistryFile> {
  try {
    const raw = await fs.readFile(registryPath(), 'utf8')
    const parsed = JSON.parse(raw) as RegistryFile
    if (!parsed || !Array.isArray(parsed.items)) throw new Error('shape')
    const items = parsed.items
      .filter((i) => i && typeof i.path === 'string')
      .map((i) => ({
        path: i.path,
        name: typeof i.name === 'string' && i.name ? i.name : normalizeName(i.path),
        lastOpened: typeof i.lastOpened === 'string' ? i.lastOpened : new Date(0).toISOString(),
        noteCount: typeof i.noteCount === 'number' ? i.noteCount : 0
      }))
    return {
      version: 1,
      items,
      activePath: typeof parsed.activePath === 'string' ? parsed.activePath : null
    }
  } catch {
    // 迁移：第一次跑多库版本时，把旧的 last-vault.json 变成第一项
    const legacy = await readLastVault()
    if (legacy) {
      const entry: VaultEntry = {
        path: legacy,
        name: normalizeName(legacy),
        lastOpened: new Date().toISOString(),
        noteCount: await countNotes(legacy)
      }
      return { version: 1, items: [entry], activePath: legacy }
    }
    return { version: 1, items: [], activePath: null }
  }
}

async function writeRegistry(file: RegistryFile): Promise<void> {
  await atomicWriteJson(registryPath(), file)
}

export async function setActiveVault(vaultPath: string): Promise<void> {
  const reg = await readRegistry()
  reg.activePath = vaultPath
  const item = reg.items.find((i) => i.path === vaultPath)
  if (item) item.lastOpened = new Date().toISOString()
  await writeRegistry(reg)
  await writeLastVault(vaultPath)
}

/** 把一个库加进清单（已存在则只更新名称/时间/笔记数） */
export async function upsertVault(vaultPath: string): Promise<VaultEntry> {
  const reg = await readRegistry()
  const count = await countNotes(vaultPath)
  const now = new Date().toISOString()
  let item = reg.items.find((i) => i.path === vaultPath)
  if (item) {
    item.noteCount = count
    item.lastOpened = now
    item.name = item.name || normalizeName(vaultPath)
  } else {
    item = {
      path: vaultPath,
      name: normalizeName(vaultPath),
      lastOpened: now,
      noteCount: count
    }
    reg.items.push(item)
  }
  reg.items.sort((a, b) => (a.lastOpened < b.lastOpened ? 1 : -1))
  await writeRegistry(reg)
  return item
}

export async function removeVault(vaultPath: string): Promise<void> {
  const reg = await readRegistry()
  reg.items = reg.items.filter((i) => i.path !== vaultPath)
  if (reg.activePath === vaultPath) {
    reg.activePath = reg.items[0]?.path ?? null
  }
  await writeRegistry(reg)
}

export async function renameVault(vaultPath: string, name: string): Promise<void> {
  const reg = await readRegistry()
  const item = reg.items.find((i) => i.path === vaultPath)
  if (item) item.name = name.trim() || normalizeName(vaultPath)
  await writeRegistry(reg)
}

/** 给渲染进程的列表：带上「是不是当前」和实时笔记数 */
export async function listVaults(): Promise<VaultItem[]> {
  const reg = await readRegistry()
  const out: VaultItem[] = []
  for (const item of reg.items) {
    if (!(await dirExists(item.path))) continue
    out.push({
      path: item.path,
      name: item.name,
      noteCount: await countNotes(item.path),
      active: item.path === reg.activePath
    })
  }
  // 当前库不在清单里（例如手动改过 registry）时补进去
  if (reg.activePath && !out.some((i) => i.path === reg.activePath)) {
    if (await dirExists(reg.activePath)) {
      out.unshift({
        path: reg.activePath,
        name: normalizeName(reg.activePath),
        noteCount: await countNotes(reg.activePath),
        active: true
      })
    }
  }
  return out
}

export async function getActivePath(): Promise<string | null> {
  const reg = await readRegistry()
  return reg.activePath
}
