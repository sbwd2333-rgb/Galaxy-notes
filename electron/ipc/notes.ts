import { ipcMain } from 'electron'
import { getVault } from './context'
import type { Note, NotePatch } from '../../shared/types'

export function registerNotesIpc(): void {
  ipcMain.handle(
    'note:create',
    async (
      _e,
      input: { pos: [number, number, number]; color?: string; title?: string }
    ): Promise<Note> => {
      return getVault().createNote(input)
    }
  )

  ipcMain.handle('note:read', async (_e, id: string): Promise<Note> => {
    return getVault().readNote(id)
  })

  ipcMain.handle('note:update', async (_e, id: string, patch: NotePatch): Promise<Note> => {
    return getVault().updateNote(id, patch)
  })

  ipcMain.handle('note:delete', async (_e, id: string) => {
    return getVault().deleteNote(id)
  })
}
