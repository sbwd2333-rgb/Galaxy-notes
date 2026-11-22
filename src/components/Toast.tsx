import { useUi } from '../store/uiStore'

export function Toast(): JSX.Element | null {
  const toast = useUi((s) => s.toast)
  if (!toast) return null
  return (
    <div className={`toast ${toast.level === 'error' ? 'toast-error' : ''}`} key={toast.id}>
      {toast.text}
    </div>
  )
}
