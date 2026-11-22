import type { BrowserWindow } from 'electron'
import type { VaultStore } from './store'

let current: VaultStore | null = null
let mainWindow: BrowserWindow | null = null

export function setVault(store: VaultStore): void {
  current = store
}

export function clearVault(): void {
  current = null
}

export function getVault(): VaultStore {
  if (!current) throw new Error('NO_VAULT')
  return current
}

export function hasVault(): boolean {
  return current !== null
}

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
