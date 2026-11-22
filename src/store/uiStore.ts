import { create } from 'zustand'
import { C } from '@shared/constants'

export type AppState = { kind: 'galaxy' } | { kind: 'editor'; noteId: string }

export interface Toast {
  id: number
  level: 'info' | 'error'
  text: string
}

interface UiState {
  appState: AppState
  selection: string[]
  hoveredPlanet: string | null
  hoveredLink: string | null
  toast: Toast | null
  linkModal: { a: string; b: string } | null
  renameGid: string | null
  recolorGid: string | null
  deleteGid: string | null
  /** 编辑器打开后需要立刻插入的内容（粘贴为新笔记时用） */
  pendingInsertImage: { noteId: string; relPath: string } | null

  enterEditor: (noteId: string) => void
  exitEditor: () => void
  setHoveredPlanet: (gid: string | null) => void
  setHoveredLink: (id: string | null) => void
  toggleSelection: (gid: string) => void
  clearSelection: () => void
  showToast: (text: string, level?: 'info' | 'error') => void
  hideToast: () => void
  openLinkModal: (a: string, b: string) => void
  closeLinkModal: () => void
  setRenameGid: (gid: string | null) => void
  setRecolorGid: (gid: string | null) => void
  setDeleteGid: (gid: string | null) => void
  setPendingInsertImage: (v: { noteId: string; relPath: string } | null) => void
}

let toastTimer: number | null = null

export const useUi = create<UiState>((set, get) => ({
  appState: { kind: 'galaxy' },
  selection: [],
  hoveredPlanet: null,
  hoveredLink: null,
  toast: null,
  linkModal: null,
  renameGid: null,
  recolorGid: null,
  deleteGid: null,
  pendingInsertImage: null,

  enterEditor: (noteId) => set({ appState: { kind: 'editor', noteId }, hoveredPlanet: null }),
  exitEditor: () => set({ appState: { kind: 'galaxy' } }),

  setHoveredPlanet: (gid) => set({ hoveredPlanet: gid }),
  setHoveredLink: (id) => set({ hoveredLink: id }),

  toggleSelection: (gid) => {
    const sel = get().selection
    if (sel.includes(gid)) {
      set({ selection: sel.filter((g) => g !== gid) })
      return
    }
    // 上限 2：已选 2 个时再来一个，替换最早选中的（规格书 §6 #5）
    const next = sel.length >= C.MAX_SELECTION ? [...sel.slice(sel.length - C.MAX_SELECTION + 1), gid] : [...sel, gid]
    set({ selection: next })
  },

  clearSelection: () => set({ selection: [] }),

  showToast: (text, level = 'info') => {
    if (toastTimer) window.clearTimeout(toastTimer)
    set({ toast: { id: Date.now(), level, text } })
    toastTimer = window.setTimeout(() => set({ toast: null }), C.TOAST_MS)
  },
  hideToast: () => set({ toast: null }),

  openLinkModal: (a, b) => set({ linkModal: { a, b } }),
  closeLinkModal: () => set({ linkModal: null }),
  setRenameGid: (gid) => set({ renameGid: gid }),
  setRecolorGid: (gid) => set({ recolorGid: gid }),
  setDeleteGid: (gid) => set({ deleteGid: gid }),
  setPendingInsertImage: (v) => set({ pendingInsertImage: v })
}))
