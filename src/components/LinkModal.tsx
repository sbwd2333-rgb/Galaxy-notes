import { useEffect, useMemo, useRef, useState } from 'react'
import { useVault } from '../store/vaultStore'
import { useUi } from '../store/uiStore'
import { Modal } from './Modal'
import { getPlanetTexture } from '../scenes/galaxy/PlanetTexture'
import { UNTITLED } from '@shared/constants'

function PlanetThumb({ gid, color }: { gid: string; color: string }): JSX.Element {
  const src = useMemo(() => {
    const tex = getPlanetTexture(gid, color)
    const canvas = tex.image as HTMLCanvasElement
    const cv = document.createElement('canvas')
    cv.width = cv.height = 96
    const ctx = cv.getContext('2d')!
    ctx.drawImage(canvas, 0, 0, 96, 96)
    return cv.toDataURL('image/png')
  }, [gid, color])
  return <img className="link-thumb" src={src} alt="" />
}

export function LinkModal(): JSX.Element | null {
  const linkModal = useUi((s) => s.linkModal)
  const close = useUi((s) => s.closeLinkModal)
  const clearSelection = useUi((s) => s.clearSelection)
  const showToast = useUi((s) => s.showToast)
  const notes = useVault((s) => s.notes)
  const createLink = useVault((s) => s.createLink)

  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const aNote = notes.find((n) => n.gid === linkModal?.a)
  const bNote = notes.find((n) => n.gid === linkModal?.b)

  useEffect(() => {
    if (linkModal) {
      setLabel('')
      setBusy(false)
      window.setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [linkModal])

  useEffect(() => {
    if (!linkModal) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [linkModal, close])

  if (!linkModal || !aNote || !bNote) return null

  const submit = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    const res = await createLink(aNote.gid, bNote.gid, label.trim())
    setBusy(false)
    if (!res) {
      showToast('建立关联失败', 'error')
      return
    }
    if (res.existed) showToast('这两篇笔记已有关联，已更新标签')
    else showToast('已建立关联')
    clearSelection()
    close()
  }

  return (
    <Modal onBackdrop={close}>
      <div className="modal-title">建立关联</div>
      <div className="link-row">
        <div className="link-side">
          <PlanetThumb gid={aNote.gid} color={aNote.color} />
          <div className="link-name">{aNote.title.trim() || UNTITLED}</div>
        </div>
        <div className="link-arrow">↔</div>
        <div className="link-side">
          <PlanetThumb gid={bNote.gid} color={bNote.color} />
          <div className="link-name">{bNote.title.trim() || UNTITLED}</div>
        </div>
      </div>
      <input
        ref={inputRef}
        className="text-input"
        placeholder="关系标签，例如：同一问题的两面（可留空）"
        value={label}
        maxLength={40}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit()
        }}
      />
      <div className="modal-actions">
        <button className="btn ghost" onClick={close}>
          取消
        </button>
        <button className="btn primary" onClick={() => void submit()} disabled={busy}>
          {busy ? '正在建立…' : '建立关联'}
        </button>
      </div>
    </Modal>
  )
}
