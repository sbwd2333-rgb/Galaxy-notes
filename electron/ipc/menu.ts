import { BrowserWindow, Menu, ipcMain, clipboard } from 'electron'
import type { ContextMenuItem, ContextMenuPayload } from '../../shared/types'

/**
 * 右键菜单用 Electron 原生 Menu 弹出：
 * 无论渲染进程的 CSS 怎样变，菜单都不会被 overflow 裁掉，也不会吃到画布事件。
 * 返回被点击项的 id（取消则 null）。
 */
export function registerMenuIpc(): void {
  ipcMain.handle(
    'menu:show',
    async (e, payload: ContextMenuPayload): Promise<string | null> => {
      const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
      const items = payload.items.filter((it) => it.id && it.label)

      return new Promise<string | null>((resolve) => {
        let settled = false
        const finish = (value: string | null): void => {
          if (settled) return
          settled = true
          resolve(value)
        }

        const template = items.map((item: ContextMenuItem) => ({
          id: item.id,
          label: item.label,
          enabled: item.enabled !== false,
          click: () => finish(item.id)
        }))

        if (template.length === 0) {
          finish(null)
          return
        }

        const menu = Menu.buildFromTemplate(template)
        menu.popup({
          window: win,
          // 菜单被关掉后 click 已经先执行；这里只处理"点外面关掉"
          callback: () => setTimeout(() => finish(null), 30)
        })
      })
    }
  )

  ipcMain.handle('clipboard:write-text', async (_e, text: string) => {
    await clipboard.writeText(text)
  })
}
