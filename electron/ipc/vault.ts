import { dialog, ipcMain, shell } from 'electron'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { VaultStore } from './store'
import { clearVault, getVault, setVault } from './context'
import {
  listVaults,
  removeVault,
  renameVault,
  setActiveVault,
  upsertVault
} from './registry'
import type {
  VaultCreateResult,
  VaultDeleteResult,
  VaultItem,
  VaultLoadResult,
  VaultSettings
} from '../../shared/types'
import { checkVaultPath } from './vaultGuard'

/** 我们自己在库里建的东西；删除星系时只动这些 */
const OWN_ENTRIES = new Set(['notes', 'assets', 'graph.json', 'vault.json'])

function makeStore(vaultPath: string): VaultStore {
  return new VaultStore(vaultPath, { trash: (p) => shell.trashItem(p) })
}

async function exists(p: string): Promise<boolean> {
  try {
    const st = await fs.stat(p)
    return st.isDirectory()
  } catch {
    return false
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p)
    return true
  } catch {
    return false
  }
}

/** 打开（或初始化）一个库，切换过去，并登记到星系清单 */
async function openVault(vaultPath: string): Promise<VaultItem> {
  if (!(await exists(vaultPath))) throw new Error('VAULT_NOT_FOUND')
  const store = makeStore(vaultPath)
  // init() 对已有库是无害的：目录齐全就不动，没有笔记才生成欢迎笔记
  await store.init()
  setVault(store)
  const entry = await upsertVault(store.root)
  await setActiveVault(store.root)
  const all = await listVaults()
  return (
    all.find((i) => i.path === store.root) ?? {
      path: store.root,
      name: entry.name,
      noteCount: entry.noteCount,
      active: true
    }
  )
}

export function registerVaultIpc(): void {
  ipcMain.handle('vault:select', async () => {
    const res = await dialog.showOpenDialog({
      title: '选择一个目录作为星系笔记的库',
      buttonLabel: '选择这个目录',
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    return res.filePaths[0]
  })

  ipcMain.handle(
    'vault:init',
    async (_e, vaultPath: string): Promise<{ ok: true; welcomeNoteId: string } | { ok: false; message: string }> => {
      const check = checkVaultPath(vaultPath)
      if (!check.ok) return { ok: false, message: check.message ?? '这个目录不能作为星系库。' }
      const store = makeStore(vaultPath)
      const { welcomeNoteId } = await store.init()
      setVault(store)
      await upsertVault(store.root)
      await setActiveVault(store.root)
      return { ok: true as const, welcomeNoteId }
    }
  )

  ipcMain.handle('vault:check-path', async (_e, vaultPath: string) => {
    return checkVaultPath(vaultPath)
  })

  ipcMain.handle('vault:load', async (): Promise<VaultLoadResult> => {
    return getVault().load()
  })

  ipcMain.handle('vault:save-settings', async (_e, patch: Partial<VaultSettings>) => {
    await getVault().saveSettings(patch)
  })

  // ---------- 多星系 ----------

  ipcMain.handle('vault:list', async (): Promise<VaultItem[]> => {
    return listVaults()
  })

  ipcMain.handle('vault:create', async (): Promise<VaultCreateResult> => {
    const res = await dialog.showOpenDialog({
      title: '新建一个星系（选一个专门放笔记的文件夹）',
      buttonLabel: '用这个文件夹',
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || res.filePaths.length === 0) {
      return { ok: false, reason: 'cancelled' }
    }
    const picked = res.filePaths[0]
    const check = checkVaultPath(picked)
    if (!check.ok) {
      return { ok: false, reason: 'blocked', message: check.message ?? '这个目录不能作为星系库。' }
    }
    const item = await openVault(picked)
    return { ok: true, item }
  })

  ipcMain.handle('vault:switch', async (_e, vaultPath: string): Promise<VaultItem> => {
    return openVault(path.resolve(vaultPath))
  })

  ipcMain.handle('vault:remove', async (_e, vaultPath: string): Promise<VaultItem[]> => {
    const targetPath = path.resolve(vaultPath)
    const current = await listVaults()
    const active = current.find((i) => i.active)
    if (active && active.path === targetPath) throw new Error('CANNOT_REMOVE_ACTIVE')
    await removeVault(targetPath)
    return listVaults()
  })

  /**
   * 删除一个星系：把它的数据送进回收站（可恢复）。
   * 目录里如果还有用户自己的文件，只删星系数据、保留目录；目录里只有我们的东西才整个删。
   */
  ipcMain.handle('vault:delete', async (_e, vaultPath: string): Promise<VaultDeleteResult> => {
    const targetPath = path.resolve(vaultPath)
    const list = await listVaults()
    const target = list.find((i) => i.path === targetPath)
    if (!target) throw new Error('VAULT_NOT_FOUND')

    let scope: 'whole' | 'partial' = 'partial'
    const entries = await fs.readdir(targetPath)
    const extras = entries.filter((e) => !OWN_ENTRIES.has(e))
    if (extras.length === 0) {
      await shell.trashItem(targetPath)
      scope = 'whole'
    } else {
      // 保留目录，只清掉我们建的 notes/assets/graph.json/vault.json
      for (const name of ['graph.json', 'vault.json', 'notes', 'assets']) {
        const p = path.join(targetPath, name)
        if (await pathExists(p)) await shell.trashItem(p)
      }
    }

    await removeVault(targetPath)

    const deletedActive = target.active
    let nextActive: VaultItem | null = null
    if (deletedActive) {
      clearVault()
      const rest = await listVaults()
      if (rest.length > 0) nextActive = await openVault(rest[0].path)
    }
    return { scope, remaining: await listVaults(), nextActive, deletedActive }
  })

  ipcMain.handle('vault:rename', async (_e, vaultPath: string, name: string): Promise<VaultItem | null> => {
    const targetPath = path.resolve(vaultPath)
    await renameVault(targetPath, name)
    const all = await listVaults()
    return all.find((i) => i.path === targetPath) ?? null
  })

  ipcMain.handle('vault:reveal', async (_e, vaultPath: string): Promise<boolean> => {
    const err = await shell.openPath(path.resolve(vaultPath))
    return err === ''
  })
}
