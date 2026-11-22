import { useRef, useState } from 'react'
import type { Note } from '@shared/types'
import { NoteEditor, type NoteEditorHandle } from './NoteEditor'

interface EditorOverlayProps {
  note: Note
  editorRef: React.MutableRefObject<NoteEditorHandle | null>
  onClosed: () => void
  onOpenNote?: (gid: string) => void
}

/**
 * 编辑态浮层：星系留在底下（不卸载），这里只叠一层 blur + 暗色 + 卡片。
 * 点卡片外的任何地方 = 保存并缩回（规格书 §5.3）。
 */
export function EditorOverlay({
  note,
  editorRef,
  onClosed,
  onOpenNote
}: EditorOverlayProps): JSX.Element {
  const [closing, setClosing] = useState(false)

  const handleClosed = (): void => {
    if (closing) return
    setClosing(true)
    window.setTimeout(() => {
      onClosed()
    }, 170)
  }

  return (
    <div
      className={`editor-layer ${closing ? 'closing' : ''}`}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) void editorRef.current?.requestClose()
      }}
    >
      <div className="editor-stage">
        <NoteEditor
          ref={editorRef}
          note={note}
          onClosed={handleClosed}
          onOpenNote={onOpenNote}
        />
      </div>
    </div>
  )
}
