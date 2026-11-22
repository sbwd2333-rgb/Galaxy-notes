import type { ReactNode } from 'react'
import { Modal } from './Modal'

interface ConfirmModalProps {
  open: boolean
  title: string
  message?: ReactNode
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  danger = false,
  onConfirm,
  onCancel
}: ConfirmModalProps): JSX.Element | null {
  if (!open) return null
  return (
    <Modal width={430} onBackdrop={onCancel}>
      <div className="modal-title">{title}</div>
      {message && <div className="sub-note">{message}</div>}
      <div className="modal-actions">
        <button className="btn ghost" onClick={onCancel}>
          {cancelText}
        </button>
        <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>
          {confirmText}
        </button>
      </div>
    </Modal>
  )
}
