import { contextBridge, ipcRenderer } from 'electron'
import type {
  Api,
  ContextMenuPayload,
  LinkOrigin,
  NotePatch,
  VaultSettings
} from '../shared/types'

const api: Api = {
  vaultSelect: () => ipcRenderer.invoke('vault:select'),
  vaultInit: (path: string) => ipcRenderer.invoke('vault:init', path),
  vaultLoad: () => ipcRenderer.invoke('vault:load'),
  vaultSaveSettings: (patch: Partial<VaultSettings>) => ipcRenderer.invoke('vault:save-settings', patch),
  vaultCheckPath: (path: string) => ipcRenderer.invoke('vault:check-path', path),

  vaultList: () => ipcRenderer.invoke('vault:list'),
  vaultCreate: () => ipcRenderer.invoke('vault:create'),
  vaultSwitch: (path: string) => ipcRenderer.invoke('vault:switch', path),
  vaultRemove: (path: string) => ipcRenderer.invoke('vault:remove', path),
  vaultDelete: (path: string) => ipcRenderer.invoke('vault:delete', path),
  vaultReveal: (path: string) => ipcRenderer.invoke('vault:reveal', path),
  vaultRename: (path: string, name: string) => ipcRenderer.invoke('vault:rename', path, name),

  noteCreate: (input) => ipcRenderer.invoke('note:create', input),
  noteRead: (id: string) => ipcRenderer.invoke('note:read', id),
  noteUpdate: (id: string, patch: NotePatch) => ipcRenderer.invoke('note:update', id, patch),
  noteDelete: (id: string) => ipcRenderer.invoke('note:delete', id),

  linkCreate: (input: {
    a: string
    b: string
    label: string
    origin?: LinkOrigin
    aiRationale?: string | null
  }) => ipcRenderer.invoke('link:create', input),
  linkUpdate: (id: string, label: string) => ipcRenderer.invoke('link:update', id, label),
  linkDelete: (id: string) => ipcRenderer.invoke('link:delete', id),

  assetSave: (input: { noteId: string; data: ArrayBuffer; ext: string }) =>
    ipcRenderer.invoke('asset:save', input),
  pickImage: (noteId: string) => ipcRenderer.invoke('asset:pick-image', noteId),
  clipboardReadImage: () => ipcRenderer.invoke('clipboard:read-image'),

  showContextMenu: (payload: ContextMenuPayload) => ipcRenderer.invoke('menu:show', payload),
  notify: (level: 'info' | 'error', message: string) =>
    ipcRenderer.invoke('app:notify', level, message),
  writeClipboard: (text: string) => ipcRenderer.invoke('clipboard:write-text', text),
  setWindowTitle: (title: string) => ipcRenderer.invoke('app:set-title', title),
  readyToClose: () => ipcRenderer.send('app:flushed'),
  onFlushRequest: (cb: () => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('app:flush', handler)
    return () => ipcRenderer.removeListener('app:flush', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
