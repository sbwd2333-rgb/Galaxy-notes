import { useVault } from '../store/vaultStore'
import { useUi } from '../store/uiStore'
import { Modal } from './Modal'
import { PALETTE } from '../lib/color'
import { UNTITLED } from '@shared/constants'

export function ColorModal(): JSX.Element | null {
  const gid = useUi((s) => s.recolorGid)
  const setGid = useUi((s) => s.setRecolorGid)
  const showToast = useUi((s) => s.showToast)
  const notes = useVault((s) => s.notes)
  const updateNote = useVault((s) => s.updateNote)

  const note = notes.find((n) => n.gid === gid)
  if (!note) return null

  const pick = async (color: string): Promise<void> => {
    const updated = await updateNote(note.gid, { color })
    if (!updated) showToast('换色失败', 'error')
    setGid(null)
  }

  return (
    <Modal width={380} onBackdrop={() => setGid(null)}>
      <div className="modal-title">选择星球颜色</div>
      <div className="sub-note">《{note.title.trim() || UNTITLED}》</div>
      <div className="swatch-grid">
        {PALETTE.map((c) => (
          <button
            key={c}
            className={`swatch ${c === note.color ? 'on' : ''}`}
            style={{ background: c, boxShadow: `0 0 18px ${c}66` }}
            onClick={() => void pick(c)}
            aria-label={c}
          />
        ))}
      </div>
      <div className="modal-actions">
        <button className="btn ghost" onClick={() => setGid(null)}>
          取消
        </button>
      </div>
    </Modal>
  )
}
