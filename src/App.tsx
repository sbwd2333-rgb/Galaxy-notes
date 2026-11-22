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
import { Intro } from './components/Intro'
import { Welcome } from './components/Welcome'
import { Toast } from './components/Toast'
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

  // 全局 Esc：焦点不在编辑器里时也能缩回
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (linkModal || renameGid || recolorGid || deleteGid) return
      if (e.defaultPrevented) return
      if (appState.kind === 'editor') {
        void editorRef.current?.requestClose()
      } else if (selection.length > 0) {
        clearSelection()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [appState.kind, selection.length, linkModal, renameGid, recolorGid, deleteGid, clearSelection])

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
      const pos = positions[gid]
      if (pos) sceneApi.current?.focusOn(pos)
      clearSelection()
      enterEditor(gid)
    },
    [positions, clearSelection, enterEditor]
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
            sceneApi={sceneApi}
            onHoverPlanet={setHoveredPlanet}
            onHoverLink={setHoveredLink}
            onPlanetClick={enterEditor}
            onPlanetSelect={toggleSelection}
            onPlanetContextMenu={onPlanetContextMenu}
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
          />
        )}

        {selection.length === 2 && appState.kind === 'galaxy' && (
          <div className="selection-hint">已选中 2 颗星球 · 右键可以建立关联</div>
        )}

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
