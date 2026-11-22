import { create } from 'zustand'
import type {
  Link,
  Note,
  NotePatch,
  VaultDeleteResult,
  VaultItem,
  VaultSettings
} from '@shared/types'
import { layoutNotes, type Vec3 } from '../lib/layout'

interface VaultState {
  notes: Note[]
  links: Link[]
  settings: VaultSettings | null
  positions: Record<string, Vec3>
  degrees: Record<string, number>
  corrupt: string[]
  vaults: VaultItem[]
  loaded: boolean
  loading: boolean
  switching: boolean
  error: string | null

  load: () => Promise<void>
  reload: () => Promise<void>
  refreshVaults: () => Promise<void>
  createVault: () => Promise<{ item: VaultItem | null; message: string | null }>
  switchVault: (path: string) => Promise<VaultItem | null>
  removeVault: (path: string) => Promise<boolean>
  deleteVault: (path: string) => Promise<VaultDeleteResult | null>
  clearVaultState: () => void
  createNote: (pos: Vec3, color?: string) => Promise<Note | null>
  updateNote: (gid: string, patch: NotePatch) => Promise<Note | null>
  deleteNote: (gid: string) => Promise<boolean>
  createLink: (a: string, b: string, label: string) => Promise<{ link: Link; existed: boolean } | null>
  updateLink: (id: string, label: string) => Promise<void>
  deleteLink: (id: string) => Promise<void>
  saveSettings: (patch: Partial<VaultSettings>) => Promise<void>
  setPositions: (positions: Record<string, Vec3>) => void
}

function computeDegrees(links: Link[]): Record<string, number> {
  const degrees: Record<string, number> = {}
  for (const l of links) {
    degrees[l.a] = (degrees[l.a] ?? 0) + 1
    degrees[l.b] = (degrees[l.b] ?? 0) + 1
  }
  return degrees
}

const EMPTY_VAULT_STATE = {
  notes: [] as Note[],
  links: [] as Link[],
  positions: {} as Record<string, Vec3>,
  degrees: {} as Record<string, number>,
  corrupt: [] as string[]
}

export const useVault = create<VaultState>((set, get) => ({
  notes: [],
  links: [],
  settings: null,
  positions: {},
  degrees: {},
  corrupt: [],
  vaults: [],
  loaded: false,
  loading: false,
  switching: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null })
    try {
      const res = await window.api.vaultLoad()
      const positionsMap = layoutNotes(res.notes, res.links)
      const positions: Record<string, Vec3> = {}
      for (const [gid, p] of positionsMap) positions[gid] = p

      // 把收敛后的位置写回磁盘（只写变化超过 0.5 的，规格书 §7.2.3）
      const changed = res.notes.filter((n) => {
        const p = positions[n.gid]
        if (!p) return false
        return Math.hypot(p[0] - n.pos[0], p[1] - n.pos[1], p[2] - n.pos[2]) > 0.5
      })
      for (const n of changed) {
        const p = positions[n.gid]
        void window.api.noteUpdate(n.gid, { pos: p })
      }

      set({
        notes: res.notes,
        links: res.links,
        settings: res.settings,
        positions,
        degrees: computeDegrees(res.links),
        corrupt: res.corrupt,
        loaded: true,
        loading: false,
        switching: false
      })
      void get().refreshVaults()
    } catch (err) {
      set({ loading: false, switching: false, error: String(err), loaded: false, ...EMPTY_VAULT_STATE })
    }
  },

  reload: async () => {
    await get().load()
  },

  refreshVaults: async () => {
    try {
      const list = await window.api.vaultList()
      set({ vaults: list })
    } catch {
      /* 列表拿不到不影响当前库 */
    }
  },

  createVault: async () => {
    try {
      const res = await window.api.vaultCreate()
      if (!res.ok) {
        return {
          item: null,
          message: res.reason === 'blocked' ? res.message ?? '这个目录不能作为星系库。' : null
        }
      }
      await get().load()
      return { item: res.item ?? null, message: null }
    } catch (err) {
      set({ error: String(err) })
      return { item: null, message: String(err) }
    }
  },

  switchVault: async (path: string) => {
    const current = get().vaults.find((v) => v.active)
    if (current && current.path === path) return current
    set({ switching: true })
    try {
      const item = await window.api.vaultSwitch(path)
      await get().load()
      return item
    } catch (err) {
      set({ switching: false, error: String(err) })
      return null
    }
  },

  removeVault: async (path: string) => {
    try {
      const list = await window.api.vaultRemove(path)
      set({ vaults: list })
      return true
    } catch (err) {
      set({ error: String(err) })
      return false
    }
  },

  deleteVault: async (path: string) => {
    try {
      const res = await window.api.vaultDelete(path)
      set({ vaults: res.remaining })
      if (res.deletedActive) {
        if (res.nextActive) await get().load()
        else get().clearVaultState()
      }
      return res
    } catch (err) {
      set({ error: String(err) })
      return null
    }
  },

  clearVaultState: () => {
    set({
      ...EMPTY_VAULT_STATE,
      settings: null,
      loaded: false,
      loading: false,
      switching: false,
      error: null
    })
  },

  createNote: async (pos, color) => {
    try {
      const note = await window.api.noteCreate({ pos, color })
      const positions = { ...get().positions, [note.gid]: pos }
      set({
        notes: [...get().notes, note],
        positions,
        degrees: { ...get().degrees, [note.gid]: 0 }
      })
      void get().refreshVaults()
      return note
    } catch (err) {
      set({ error: String(err) })
      return null
    }
  },

  updateNote: async (gid, patch) => {
    try {
      const updated = await window.api.noteUpdate(gid, patch)
      set({
        notes: get().notes.map((n) => (n.gid === gid ? updated : n))
      })
      return updated
    } catch (err) {
      set({ error: String(err) })
      return null
    }
  },

  deleteNote: async (gid) => {
    try {
      await window.api.noteDelete(gid)
      const links = get().links.filter((l) => l.a !== gid && l.b !== gid)
      const positions = { ...get().positions }
      delete positions[gid]
      set({
        notes: get().notes.filter((n) => n.gid !== gid),
        links,
        positions,
        degrees: computeDegrees(links)
      })
      void get().refreshVaults()
      return true
    } catch (err) {
      set({ error: String(err) })
      return false
    }
  },

  createLink: async (a, b, label) => {
    try {
      const res = await window.api.linkCreate({ a, b, label, origin: 'manual' })
      const exists = get().links.some((l) => l.id === res.link.id)
      const links = exists
        ? get().links.map((l) => (l.id === res.link.id ? res.link : l))
        : [...get().links, res.link]
      set({ links, degrees: computeDegrees(links) })
      return res
    } catch (err) {
      set({ error: String(err) })
      return null
    }
  },

  updateLink: async (id, label) => {
    try {
      const link = await window.api.linkUpdate(id, label)
      set({ links: get().links.map((l) => (l.id === id ? link : l)) })
    } catch (err) {
      set({ error: String(err) })
    }
  },

  deleteLink: async (id) => {
    try {
      await window.api.linkDelete(id)
      const links = get().links.filter((l) => l.id !== id)
      set({ links, degrees: computeDegrees(links) })
    } catch (err) {
      set({ error: String(err) })
    }
  },

  saveSettings: async (patch) => {
    try {
      await window.api.vaultSaveSettings(patch)
      const cur = get().settings
      set({ settings: cur ? { ...cur, ...patch } : cur })
    } catch {
      /* 设置保存失败不阻塞交互 */
    }
  },

  setPositions: (positions) => set({ positions })
}))
