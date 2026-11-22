import { useEffect, useRef, useState } from 'react'
import { useVault } from '../store/vaultStore'
import { useUi } from '../store/uiStore'
import { Modal } from './Modal'
import { UNTITLED } from '@shared/constants'

export function RenameModal(): JSX.Element | null {
  const gid = useUi((s) => s.renameGid)
  const setGid = useUi((s) => s.setRenameGid)
  const showToast = useUi((s) => s.showToast)
  const notes = useVault((s) => s.notes)
  const updateNote = useVault((s) => s.updateNote)

  const note = notes.find((n) => n.gid === gid)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (note) {
      setValue(note.title)
      window.setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 30)
    }
  }, [note?.gid])

  if (!note) return null

  const save = async (): Promise<void> => {
    const updated = await updateNote(note.gid, { title: value })
    if (!updated) showToast('重命名失败', 'error')
    setGid(null)
  }

  return (
    <Modal
      width={420}
      onBackdrop={() => setGid(null)}
      className="modal-in"
    >
      <div className="modal-title">重命名</div>
      <input
        ref={inputRef}
        className="text-input"
        value={value}
        placeholder={UNTITLED}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save()
          if (e.key === 'Escape') setGid(null)
        }}
      />
      <div className="modal-actions">
        <button className="btn ghost" onClick={() => setGid(null)}>
          取消
        </button>
        <button className="btn primary" onClick={() => void save()}>
          保存
        </button>
      </div>
    </Modal>
  )
}
