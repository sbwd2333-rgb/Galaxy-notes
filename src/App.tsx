import { useCallback, useEffect, useRef, useState } from 'react'
import { useVault } from './store/vaultStore'
import { useUi } from './store/uiStore'
import { GalaxyScene, type SceneApi } from './scenes/galaxy/GalaxyScene'
import { EditorOverlay } from './scenes/editor/EditorOverlay'
import type { NoteEditorHandle } from './scenes/editor/NoteEditor'
import { Sidebar } from './components/Sidebar'
import { LinkModal } from './components/LinkModal'
import { RenameModal } from './components/RenameModal'
import { ColorModal } from './components/ColorModal'
import { DeleteModal } from './components/DeleteModal'
import { DeleteVaultModal } from './components/DeleteVaultModal'
import { ConfirmModal } from './components/ConfirmModal'
import { Intro } from './components/Intro'
import { Welcome } from './components/Welcome'
import { Toast } from './components/Toast'
import type { Vec3 } from './lib/layout'
import type { ContextMenuItem, VaultItem, VaultSettings } from '@shared/types'

export default function App(): JSX.Element {
  const loaded = useVault((s) => s.loaded)
  const error = useVault((s) => s.error)
  const notes = useVault((s) => s.notes)
  const links = useVault((s) => s.links)
  const settings = useVault((s) => s.settings)
  const positions = useVault((s) => s.positions)
  const degrees = useVault((s) => s.degrees)
  const corrupt = useVault((s) => s.corrupt)
  const switching = useVault((s) => s.switching)
  const load = useVault((s) => s.load)
  const refreshVaults = useVault((s) => s.refreshVaults)
  const createVault = useVault((s) => s.createVault)
  const switchVault = useVault((s) => s.switchVault)
  const deleteVault = useVault((s) => s.deleteVault)
  const createNote = useVault((s) => s.createNote)
  const updateNote = useVault((s) => s.updateNote)
  const setPositions = useVault((s) => s.setPositions)
  const saveSettings = useVault((s) => s.saveSettings)

  const appState = useUi((s) => s.appState)
  const selection = useUi((s) => s.selection)
  const hoveredPlanet = useUi((s) => s.hoveredPlanet)
  const hoveredLink = useUi((s) => s.hoveredLink)
  const linkModal = useUi((s) => s.linkModal)
  const renameGid = useUi((s) => s.renameGid)
  const recolorGid = useUi((s) => s.recolorGid)
  const deleteGid = useUi((s) => s.deleteGid)

  const enterEditor = useUi((s) => s.enterEditor)
  const exitEditor = useUi((s) => s.exitEditor)
  const setHoveredPlanet = useUi((s) => s.setHoveredPlanet)
  const setHoveredLink = useUi((s) => s.setHoveredLink)
  const toggleSelection = useUi((s) => s.toggleSelection)
  const clearSelection = useUi((s) => s.clearSelection)
  const showToast = useUi((s) => s.showToast)
  const openLinkModal = useUi((s) => s.openLinkModal)
  const setRenameGid = useUi((s) => s.setRenameGid)
  const setRecolorGid = useUi((s) => s.setRecolorGid)
  const setDeleteGid = useUi((s) => s.setDeleteGid)
  const setPendingInsertImage = useUi((s) => s.setPendingInsertImage)

  const [booted, setBooted] = useState(false)
  const [introDone, setIntroDone] = useState(false)
  const [deletingVault, setDeletingVault] = useState<VaultItem | null>(null)
  const [layoutEditing, setLayoutEditing] = useState(false)
  const [confirmLeaveLayout, setConfirmLeaveLayout] = useState(false)
  const layoutSnapshot = useRef<Record<string, Vec3> | null>(null)
  const layoutDirty = useRef(false)
  const sceneApi = useRef<SceneApi | null>(null)
  const editorRef = useRef<NoteEditorHandle | null>(null)
  const corruptShown = useRef(false)

  useEffect(() => {
    void load().finally(() => {
      setBooted(true)
      void refreshVaults()
    })
  }, [load, refreshVaults])

  // 损坏文件提示（规格书 §3.5.5）
  useEffect(() => {
    if (corruptShown.current) return
    if (corrupt.length > 0) {
      corruptShown.current = true
      showToast(`检测到 ${corrupt.length} 个文件损坏，已备份为 .corrupt-*`, 'error')
    }
  }, [corrupt, showToast])

  // 关窗前让编辑器 flush 一次（规格书 §8.4）
  useEffect(() => {
    const off = window.api.onFlushRequest(() => {
      const flush = editorRef.current?.flush()
      void Promise.resolve(flush)
        .catch(() => undefined)
        .finally(() => window.api.readyToClose())
    })
    return off
  }, [])

  // ---------- 布局编辑（拖动星球改位置） ----------

  const enterLayoutEdit = useCallback(() => {
    layoutSnapshot.current = { ...positions }
    layoutDirty.current = false
    clearSelection()
    setLayoutEditing(true)
  }, [positions, clearSelection])

  /** 把当前布局写回磁盘（只写真正移动过的） */
  const saveLayout = useCallback(async (): Promise<boolean> => {
    const snap = layoutSnapshot.current ?? {}
    const current = useVault.getState().positions
    let allOk = true
    let moved = 0
    for (const [gid, p] of Object.entries(current)) {
      const old = snap[gid]
      if (!old) continue
      const d = Math.abs(old[0] - p[0]) + Math.abs(old[1] - p[1]) + Math.abs(old[2] - p[2])
      if (d < 0.01) continue
      const res = await updateNote(gid, { pos: p })
      if (!res) allOk = false
      else moved++
    }
    if (allOk) {
      layoutSnapshot.current = { ...current }
      layoutDirty.current = false
    }
    if (moved > 0) showToast(`位置已保存（${moved} 颗星球）`)
    else showToast('位置没有变化')
    return allOk
  }, [updateNote, showToast])

  const exitLayoutEdit = useCallback(
    (save: boolean) => {
      if (save) {
        void saveLayout()
      } else if (layoutSnapshot.current) {
        setPositions(layoutSnapshot.current)
      }
      layoutDirty.current = false
      setLayoutEditing(false)
      setConfirmLeaveLayout(false)
    },
    [saveLayout, setPositions]
  )

  /** 点「退出」：没动过直接退，动过就问一句 */
  const requestExitLayout = useCallback(() => {
    if (layoutDirty.current) setConfirmLeaveLayout(true)
    else exitLayoutEdit(false)
  }, [exitLayoutEdit])

  const handlePlanetDragEnd = useCallback(
    (gid: string, pos: Vec3) => {
      const current = useVault.getState().positions
      const old = current[gid]
      if (old) {
        const d = Math.abs(old[0] - pos[0]) + Math.abs(old[1] - pos[1]) + Math.abs(old[2] - pos[2])
        if (d < 0.02) return
      }
      setPositions({ ...current, [gid]: pos })
      layoutDirty.current = true
    },
    [setPositions]
  )

  // 全局 Esc：焦点不在编辑器里时也能缩回
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (linkModal || renameGid || recolorGid || deleteGid) return
      if (e.defaultPrevented) return
      if (layoutEditing) {
        if (confirmLeaveLayout) return
        requestExitLayout()
        return
      }
      if (appState.kind === 'editor') {
        void editorRef.current?.requestClose()
      } else if (selection.length > 0) {
        clearSelection()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    appState.kind,
    selection.length,
    linkModal,
    renameGid,
    recolorGid,
    deleteGid,
    clearSelection,
    layoutEditing,
    confirmLeaveLayout,
    requestExitLayout
  ])

  const handleCamera = useCallback(
    (camera: VaultSettings['camera']) => {
      void saveSettings({ camera })
    },
    [saveSettings]
  )

  // ---------- 多星系 ----------

  /** 切换/新建前先把编辑器里的内容落盘，避免丢字 */
  const closeEditorIfAny = useCallback(async () => {
    if (appState.kind !== 'editor') return
    await editorRef.current?.flush()
    exitEditor()
  }, [appState.kind, exitEditor])

  const handleSwitchVault = useCallback(
    async (item: VaultItem) => {
      if (item.active || switching) return
      await closeEditorIfAny()
      clearSelection()
      const res = await switchVault(item.path)
      if (res) showToast(`已切换到「${res.name}」`)
      else showToast('切换星系失败', 'error')
    },
    [closeEditorIfAny, clearSelection, showToast, switchVault, switching]
  )

  const handleCreateVault = useCallback(async () => {
    if (switching) return
    await closeEditorIfAny()
    clearSelection()
    const res = await createVault()
    if (res.item) showToast(`新星系「${res.item.name}」已建好`)
    else if (res.message) showToast(res.message, 'error')
  }, [closeEditorIfAny, clearSelection, createVault, showToast, switching])

  const handleRemoveVault = useCallback(
    async (item: VaultItem) => {
      setDeletingVault(item)
    },
    []
  )

  const handleConfirmDeleteVault = useCallback(
    async (item: VaultItem): Promise<boolean> => {
      // 删的是正在用的星系时，先把编辑器里的内容落盘再动手
      if (item.active) await closeEditorIfAny()
      const res = await deleteVault(item.path)
      setDeletingVault(null)
      if (!res) {
        showToast('删除失败', 'error')
        return false
      }
      if (res.deletedActive) {
        clearSelection()
        showToast(
          res.nextActive
            ? `已删除「${item.name}」，切到「${res.nextActive.name}」`
            : `已删除「${item.name}」，没有别的星系了`
        )
      } else {
        showToast(
          res.scope === 'whole'
            ? `已删除「${item.name}」，文件夹进了回收站`
            : `已删除「${item.name}」的星系数据，文件夹保留`
        )
      }
      return true
    },
    [closeEditorIfAny, clearSelection, deleteVault, showToast]
  )

  const handleRevealVault = useCallback(async (item: VaultItem) => {
    await window.api.vaultReveal(item.path)
  }, [])

  /** 搜索结果：相机先飞到那颗星球，再进编辑；退出时它就在画面中央 */
  const handleOpenNote = useCallback(
    (gid: string) => {
      if (layoutEditing) return
      const pos = positions[gid]
      if (pos) sceneApi.current?.focusOn(pos)
      clearSelection()
      enterEditor(gid)
    },
    [positions, clearSelection, enterEditor, layoutEditing]
  )

  /** 编辑器里点「关联的笔记」：先存当前这篇，再切过去；顺手把相机对到目标星球 */
  const handleOpenRelated = useCallback(
    async (gid: string) => {
      if (appState.kind === 'editor' && appState.noteId === gid) return
      await editorRef.current?.flush()
      const pos = positions[gid]
      if (pos) sceneApi.current?.focusOn(pos)
      enterEditor(gid)
    },
    [appState, positions, enterEditor]
  )

  // Ctrl+K 聚焦搜索（编辑器里 Ctrl+K 是插入链接，不抢）
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'k') return
      if (appState.kind === 'editor') return
      if (linkModal || renameGid || recolorGid || deleteGid) return
      const input = document.querySelector<HTMLInputElement>('.search-input')
      if (!input) return
      e.preventDefault()
      input.focus()
      input.select()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [appState.kind, linkModal, renameGid, recolorGid, deleteGid])

  // ---------- 星系内的右键编排 ----------

  const newNoteAt = useCallback(
    async (x: number, y: number) => {
      const pos = sceneApi.current?.screenToWorld(x, y) ?? [0, 0, 0]
      const note = await createNote(pos)
      if (!note) {
        showToast('新建笔记失败', 'error')
        return
      }
      clearSelection()
      enterEditor(note.gid)
    },
    [createNote, clearSelection, enterEditor, showToast]
  )

  const pasteAsNote = useCallback(
    async (x: number, y: number) => {
      const img = await window.api.clipboardReadImage()
      if (!img) {
        showToast('剪贴板里没有图片')
        return
      }
      const pos = sceneApi.current?.screenToWorld(x, y) ?? [0, 0, 0]
      const note = await createNote(pos)
      if (!note) {
        showToast('新建笔记失败', 'error')
        return
      }
      try {
        const { relPath } = await window.api.assetSave({
          noteId: note.gid,
          data: img.data,
          ext: img.ext
        })
        setPendingInsertImage({ noteId: note.gid, relPath })
        enterEditor(note.gid)
      } catch (err) {
        showToast(`图片保存失败：${String(err)}`, 'error')
      }
    },
    [createNote, enterEditor, setPendingInsertImage, showToast]
  )

  const runMenu = useCallback(
    async (items: ContextMenuItem[], point: { x: number; y: number }, planetGid?: string) => {
      const id = await window.api.showContextMenu({ items })
      if (!id) return
      const sel = useUi.getState().selection
      switch (id) {
        case 'new-note':
          await newNoteAt(point.x, point.y)
          break
        case 'paste-note':
          await pasteAsNote(point.x, point.y)
          break
        case 'open':
          if (planetGid) enterEditor(planetGid)
          break
        case 'rename':
          if (planetGid) setRenameGid(planetGid)
          break
        case 'recolor':
          if (planetGid) setRecolorGid(planetGid)
          break
        case 'delete':
          if (planetGid) setDeleteGid(planetGid)
          break
        case 'copy-id':
          if (planetGid) {
            await window.api.writeClipboard(planetGid)
            showToast(`已复制 ID：${planetGid}`)
          }
          break
        case 'make-link':
          if (sel.length === 2) openLinkModal(sel[0], sel[1])
          break
        case 'deselect':
          clearSelection()
          break
        default:
          break
      }
    },
    [
      clearSelection,
      enterEditor,
      newNoteAt,
      openLinkModal,
      pasteAsNote,
      setDeleteGid,
      setRecolorGid,
      setRenameGid,
      showToast
    ]
  )

  const onBlankContextMenu = useCallback(
    (x: number, y: number) => {
      const sel = useUi.getState().selection
      const items: ContextMenuItem[] = []
      if (sel.length === 2) {
        items.push({ id: 'make-link', label: '建立关联…' })
        items.push({ id: 'deselect', label: '取消选择' })
      } else if (sel.length > 0) {
        items.push({ id: 'deselect', label: '取消选择' })
      }
      items.push({ id: 'new-note', label: '新建笔记' })
      items.push({ id: 'paste-note', label: '粘贴为新笔记' })
      void runMenu(items, { x, y })
    },
    [runMenu]
  )

  const onPlanetContextMenu = useCallback(
    (gid: string) => {
      const sel = useUi.getState().selection
      const items: ContextMenuItem[] = []
      if (sel.length === 2 && sel.includes(gid)) {
        items.push({ id: 'make-link', label: '建立关联…' })
        items.push({ id: 'deselect', label: '取消选择' })
      }
      items.push({ id: 'open', label: '打开' })
      items.push({ id: 'rename', label: '重命名' })
      items.push({ id: 'recolor', label: '改颜色' })
      items.push({ id: 'copy-id', label: '复制 ID' })
      items.push({ id: 'delete', label: '删除…' })
      void runMenu(items, { x: 0, y: 0 }, gid)
    },
    [runMenu]
  )

  const activeNote = appState.kind === 'editor' ? notes.find((n) => n.gid === appState.noteId) : undefined

  // 编辑中的笔记被删掉时兜底退出
  useEffect(() => {
    if (appState.kind === 'editor' && !activeNote && loaded) exitEditor()
  }, [appState, activeNote, loaded, exitEditor])

  const introOverlay = introDone ? null : <Intro onDone={() => setIntroDone(true)} />

  if (!booted) {
    return (
      <>
        <div className="boot">
          <div className="boot-dot" />
          <div>正在展开星系…</div>
        </div>
        {introOverlay}
      </>
    )
  }

  return (
    <div className={`app ${appState.kind === 'editor' ? 'editing' : ''}`}>
      <Sidebar
        busy={switching}
        onCreate={() => void handleCreateVault()}
        onSwitch={(item) => void handleSwitchVault(item)}
        onDelete={(item) => void handleRemoveVault(item)}
        onReveal={(item) => void handleRevealVault(item)}
        onOpenNote={handleOpenNote}
      />

      <main className="stage">
        {loaded ? (
          <GalaxyScene
            notes={notes}
            links={links}
            positions={positions}
            degrees={degrees}
            selection={selection}
            hoveredPlanet={hoveredPlanet}
            hoveredLink={hoveredLink}
            camera={settings?.camera ?? { position: [0, 40, 120], target: [0, 0, 0] }}
            editing={appState.kind === 'editor' || !introDone}
            layoutEditing={layoutEditing}
            sceneApi={sceneApi}
            onHoverPlanet={setHoveredPlanet}
            onHoverLink={setHoveredLink}
            onPlanetClick={enterEditor}
            onPlanetSelect={toggleSelection}
            onPlanetContextMenu={onPlanetContextMenu}
            onPlanetDragEnd={handlePlanetDragEnd}
            onBlankClick={() => {
              if (appState.kind === 'editor') return
              if (selection.length > 0) clearSelection()
            }}
            onBlankContextMenu={onBlankContextMenu}
            onCameraChange={handleCamera}
          />
        ) : (
          <Welcome />
        )}

        {appState.kind === 'editor' && activeNote && (
          <EditorOverlay
            key={activeNote.gid}
            note={activeNote}
            editorRef={editorRef}
            onClosed={exitEditor}
            onOpenNote={(gid) => void handleOpenRelated(gid)}
          />
        )}

        {selection.length === 2 && appState.kind === 'galaxy' && !layoutEditing && (
          <div className="selection-hint">已选中 2 颗星球 · 右键可以建立关联</div>
        )}

        {/* 布局编辑：入口 + 顶部工具条 */}
        {loaded && !layoutEditing && appState.kind === 'galaxy' && (
          <button className="layout-entry" onClick={enterLayoutEdit} title="拖动星球调整位置">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            编辑位置
          </button>
        )}

        {layoutEditing && (
          <div className="layout-bar">
            <span className="layout-bar-text">拖动星球调整位置</span>
            <button className="btn primary small" onClick={() => void saveLayout()}>
              保存
            </button>
            <button className="btn ghost small" onClick={requestExitLayout}>
              退出
            </button>
          </div>
        )}

        <ConfirmModal
          open={confirmLeaveLayout}
          title="保存位置改动？"
          message="你拖动过星球。保存后它们会固定在新位置；不保存就恢复成拖动前的样子。"
          confirmText="保存并退出"
          cancelText="不保存，恢复原样"
          onConfirm={() => exitLayoutEdit(true)}
          onCancel={() => exitLayoutEdit(false)}
        />

        {error && !error.includes('NO_VAULT') && (
          <div className="boot-error">{error}</div>
        )}
      </main>

      <LinkModal />
      <RenameModal />
      <ColorModal />
      <DeleteModal />
      <DeleteVaultModal
        item={deletingVault}
        onCancel={() => setDeletingVault(null)}
        onConfirm={handleConfirmDeleteVault}
      />
      <Toast />
      {introOverlay}
    </div>
  )
}
