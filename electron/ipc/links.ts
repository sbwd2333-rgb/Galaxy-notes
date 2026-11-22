import { ipcMain } from 'electron'
import { getVault } from './context'
import type { Link, LinkCreateResult, LinkOrigin } from '../../shared/types'

export function registerLinksIpc(): void {
  ipcMain.handle(
    'link:create',
    async (
      _e,
      input: { a: string; b: string; label: string; origin?: LinkOrigin; aiRationale?: string | null }
    ): Promise<LinkCreateResult> => {
      return getVault().createLink(input)
    }
  )

  ipcMain.handle('link:update', async (_e, id: string, label: string): Promise<Link> => {
    return getVault().updateLink(id, label)
  })

  ipcMain.handle('link:delete', async (_e, id: string) => {
    return getVault().deleteLink(id)
  })
}
