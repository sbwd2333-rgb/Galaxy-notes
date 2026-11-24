import { useEffect, useRef, useState } from 'react'
import { useVault } from '../store/vaultStore'
import { useUi } from '../store/uiStore'
import { Modal } from './Modal'
import { PALETTE } from '../lib/color'
import { UNTITLED } from '@shared/constants'

const MIN_SCALE = 0.6
const MAX_SCALE = 2.5

export function ColorModal(): JSX.Element | null {
  const gid = useUi((s) => s.recolorGid)
  const setGid = useUi((s) => s.setRecolorGid)
  const showToast = useUi((s) => s.showToast)
  const notes = useVault((s) => s.notes)
  const updateNote = useVault((s) => s.updateNote)

  const note = notes.find((n) => n.gid === gid)
  const [scale, setScale] = useState(note?.scale ?? 1)
  const saveTimer = useRef<number | null>(null)
  const latest = useRef(note?.scale ?? 1)
  const initial = useRef<{ color: string; scale: number } | null>(null)

  // 每次打开（换了一颗星球）都从这颗星的当前值重新开始
  useEffect(() => {
    if (!note) return
    const s = note.scale ?? 1
    setScale(s)
    latest.current = s
    initial.current = { color: note.color, scale: s }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gid])

  if (!note) return null

  /** 点色块即时生效，但不关窗——接着就能拖大小 */
  const pick = async (color: string): Promise<void> => {
    const updated = await updateNote(note.gid, { color })
    if (!updated) showToast('换色失败', 'error')
  }

  /** 拖滑条时做一点防抖，既能看到实时变化，又不会每一帧都写盘 */
  const applyScale = (value: number): void => {
    setScale(value)
    latest.current = value
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void updateNote(note.gid, { scale: value })
    }, 120)
  }

  const flushScale = (): void => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    void updateNote(note.gid, { scale: latest.current })
  }

  const close = (): void => {
    flushScale()
    setGid(null)
  }

  /** 恢复成打开这个弹窗时的样子（颜色 + 大小一起） */
  const reset = async (): Promise<void> => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    const init = initial.current
    if (init) {
      setScale(init.scale)
      latest.current = init.scale
      await updateNote(note.gid, { color: init.color, scale: init.scale })
    }
    setGid(null)
  }

  return (
    <Modal width={420} onBackdrop={close}>
      <div className="modal-title">星球外观</div>
      <div className="sub-note">《{note.title.trim() || UNTITLED}》</div>

      <div className="field-label">
        颜色
        <span className="field-hint">点一下即时生效，可以接着调大小</span>
      </div>
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

      <div className="field-divider" />

      <div className="field-label">
        大小
        <span className="field-hint">把重点笔记放大，星系里更显眼</span>
      </div>
      <div className="scale-row">
        <span className="scale-end">小</span>
        <input
          type="range"
          min={MIN_SCALE}
          max={MAX_SCALE}
          step={0.05}
          value={scale}
          onChange={(e) => applyScale(Number(e.target.value))}
          onPointerUp={flushScale}
          onKeyUp={flushScale}
          aria-label="星球大小"
        />
        <span className="scale-end">大</span>
        <span className="scale-value">{scale.toFixed(2)}×</span>
      </div>

      <div className="modal-actions">
        <button className="link-btn" onClick={() => void reset()}>
          恢复原样
        </button>
        <div className="actions-right">
          <button className="btn primary" onClick={close}>
            完成
          </button>
        </div>
      </div>
    </Modal>
  )
}
