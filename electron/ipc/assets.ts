import { clipboard, dialog, ipcMain, shell } from 'electron'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { getVault } from './context'
import { C } from '../../shared/constants'

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp']

/**
 * 注意：Electron 44+ 的 clipboard 换成了 W3C 风格 API
 * （read / write / readText / writeText 都返回 Promise，没有 readImage 了）。
 * 读剪贴板图片走 clipboard.read() → ClipboardItem.getType()。
 */
export function registerAssetsIpc(): void {
  ipcMain.handle(
    'asset:save',
    async (_e, input: { noteId: string; data: ArrayBuffer | Uint8Array; ext: string }) => {
      const raw = input.data
      const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBuffer)
      // 复制出紧凑 buffer，避免带上整块的底层 ArrayBuffer
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      return getVault().saveAsset(input.noteId, buf as ArrayBuffer, input.ext)
    }
  )

  ipcMain.handle('clipboard:read-image', async () => {
    try {
      const items = await clipboard.read()
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'))
        if (!type) continue
        const payload = await item.getType(type)
        if (typeof payload === 'string' || !('arrayBuffer' in payload)) continue
        const buf = Buffer.from(await (payload as Blob).arrayBuffer())
        const sub = type.split('/')[1] ?? 'png'
        const ext = sub === 'jpeg' ? 'jpg' : sub
        return {
          data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
          ext
        }
      }
    } catch {
      /* 剪贴板里没有图片时直接返回 null */
    }
    return null
  })

  ipcMain.handle('shell:show-item', async (_e, absPath: string) => {
    shell.showItemInFolder(absPath)
  })

  /** 「插入图片」按钮：选本地图片 → 拷进 assets/<gid>/ → 返回相对路径 */
  ipcMain.handle('asset:pick-image', async (_e, noteId: string) => {
    const res = await dialog.showOpenDialog({
      title: '插入图片',
      buttonLabel: '插入',
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: IMAGE_EXT }]
    })
    if (res.canceled || res.filePaths.length === 0) return null
    const abs = res.filePaths[0]
    const st = await fs.stat(abs)
    if (st.size > C.MAX_IMAGE_MB * 1024 * 1024) throw new Error('IMAGE_TOO_LARGE')
    const ext = path.extname(abs).slice(1).toLowerCase()
    if (!IMAGE_EXT.includes(ext)) throw new Error('BAD_IMAGE_EXT')
    const buf = await fs.readFile(abs)
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    return getVault().saveAsset(noteId, ab, ext)
  })
}
