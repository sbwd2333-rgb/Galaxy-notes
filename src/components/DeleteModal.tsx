import { useVault } from '../store/vaultStore'
import { useUi } from '../store/uiStore'
import { Modal } from './Modal'
import { UNTITLED } from '@shared/constants'

export function DeleteModal(): JSX.Element | null {
  const gid = useUi((s) => s.deleteGid)
  const setGid = useUi((s) => s.setDeleteGid)
  const showToast = useUi((s) => s.showToast)
  const clearSelection = useUi((s) => s.clearSelection)
  const notes = useVault((s) => s.notes)
  const links = useVault((s) => s.links)
  const deleteNote = useVault((s) => s.deleteNote)

  const note = notes.find((n) => n.gid === gid)
  if (!note) return null

  const related = links.filter((l) => l.a === note.gid || l.b === note.gid).length

  const confirm = async (): Promise<void> => {
    const ok = await deleteNote(note.gid)
    if (ok) {
      showToast(`已删除《${note.title.trim() || UNTITLED}》`)
      clearSelection()
    } else {
      showToast('删除失败', 'error')
    }
    setGid(null)
  }

  return (
    <Modal width={440} onBackdrop={() => setGid(null)}>
      <div className="modal-title">删除这篇笔记？</div>
      <div className="sub-note">
        《{note.title.trim() || UNTITLED}》
        {related > 0 ? ` 还有 ${related} 条关联，会一并删除。` : ''}
      </div>
      <div className="hint">
        笔记文件会被放进系统回收站（不是直接抹掉），图片目录会一起清理。
      </div>
      <div className="modal-actions">
        <button className="btn ghost" onClick={() => setGid(null)}>
          取消
        </button>
        <button className="btn danger" onClick={() => void confirm()}>
          删除
        </button>
      </div>
    </Modal>
  )
}
