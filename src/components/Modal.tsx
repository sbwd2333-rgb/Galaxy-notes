import { useEffect, type ReactNode } from 'react'

export function Modal({
  children,
  onBackdrop,
  width = 400,
  className = ''
}: {
  children: ReactNode
  onBackdrop?: () => void
  width?: number
  className?: string
}): JSX.Element {
  // Esc = 取消，所有模态一致
  useEffect(() => {
    if (!onBackdrop) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onBackdrop()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBackdrop])

  return (
    <div
      className="modal-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onBackdrop?.()
      }}
    >
      <div className={`modal-card ${className}`} style={{ width: `min(${width}px, 92vw)` }}>
        {children}
      </div>
    </div>
  )
}
