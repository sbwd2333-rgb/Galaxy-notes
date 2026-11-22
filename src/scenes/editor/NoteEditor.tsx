import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { BubbleMenu, EditorContent, useEditor } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import type { Note } from '@shared/types'
import { C, UNTITLED } from '@shared/constants'
import { useVault } from '../../store/vaultStore'
import { useUi } from '../../store/uiStore'
import { ResizableImage } from './ResizableImage'

export interface NoteEditorHandle {
  /** 保存并请求关闭；保存失败则留在原地 */
  requestClose: () => Promise<void>
  flush: () => Promise<void>
}

interface NoteEditorProps {
  note: Note
  onClosed: () => void
  onSavingChange?: (state: 'idle' | 'saving' | 'saved' | 'error') => void
}

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])

export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(function NoteEditor(
  { note, onClosed, onSavingChange },
  ref
): JSX.Element {
  const updateNote = useVault((s) => s.updateNote)
  const showToast = useUi((s) => s.showToast)
  const pendingInsertImage = useUi((s) => s.pendingInsertImage)
  const setPendingInsertImage = useUi((s) => s.setPendingInsertImage)

  const [title, setTitle] = useState(note.title)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const titleEl = useRef<HTMLInputElement>(null)
  const composing = useRef(false)
  const saveTimer = useRef<number | null>(null)
  const titleTimer = useRef<number | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const titleRef = useRef(title)
  const closedRef = useRef(false)

  titleRef.current = title

  useEffect(() => {
    onSavingChange?.(saveState)
  }, [saveState, onSavingChange])

  const doSave = async (): Promise<boolean> => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    if (titleTimer.current) {
      window.clearTimeout(titleTimer.current)
      titleTimer.current = null
    }
    const ed = editorRef.current
    try {
      const doc = ed ? ed.getJSON() : note.doc
      const text = ed ? ed.getText().slice(0, C.TEXT_LIMIT) : note.text
      const updated = await updateNote(note.gid, {
        title: titleRef.current,
        doc: doc as never,
        text
      })
      if (!updated) {
        setSaveState('error')
        return false
      }
      setSaveState('saved')
      return true
    } catch {
      setSaveState('error')
      return false
    }
  }

  const scheduleSave = (delay = C.AUTOSAVE_DEBOUNCE_MS): void => {
    setSaveState('saving')
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void doSave()
    }, delay)
  }

  const appendImage = (ed: Editor, relPath: string): void => {
    // 按文档末尾的绝对位置插入：只用 focus('end') 时，如果最后节点就是图片，
    // ProseMirror 会保持 NodeSelection，insertContent 会把那张图替换掉。
    const pos = ed.state.doc.content.size
    ed.chain()
      .insertContentAt(pos, { type: 'image', attrs: { src: relPath } })
      .run()
  }

  const insertImageFiles = async (files: File[]): Promise<void> => {
    const ed = editorRef.current
    if (!ed) return
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue
      if (f.size > C.MAX_IMAGE_MB * 1024 * 1024) {
        showToast(`「${f.name}」超过 ${C.MAX_IMAGE_MB}MB，未插入`, 'error')
        continue
      }
      let ext = (f.name.split('.').pop() ?? '').toLowerCase()
      if (!IMAGE_EXT.has(ext)) ext = f.type.split('/')[1] ?? 'png'
      if (!IMAGE_EXT.has(ext)) continue
      try {
        const data = await f.arrayBuffer()
        const { relPath } = await window.api.assetSave({ noteId: note.gid, data, ext })
        appendImage(ed, relPath)
        scheduleSave()
      } catch (err) {
        showToast(`图片保存失败：${String(err)}`, 'error')
      }
    }
  }

  const pickImage = async (): Promise<void> => {
    const ed = editorRef.current
    if (!ed) return
    try {
      const res = await window.api.pickImage(note.gid)
      if (!res) return
      appendImage(ed, res.relPath)
      scheduleSave()
    } catch (err) {
      const msg = String(err)
      if (msg.includes('IMAGE_TOO_LARGE')) showToast(`图片超过 ${C.MAX_IMAGE_MB}MB，未插入`, 'error')
      else showToast(`插入图片失败：${msg}`, 'error')
    }
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        heading: { levels: [1, 2, 3] },
        horizontalRule: {},
        dropcursor: { color: '#ffd479', width: 2 }
      }),
      Highlight.configure({ multicolor: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener' } }),
      Placeholder.configure({ placeholder: '从这里开始写。做不到的事就写下来，做不到的原因也写下来。' }),
      ResizableImage.configure({ inline: false, allowBase64: false })
    ],
    content: note.doc as never,
    autofocus: false,
    editorProps: {
      attributes: { class: 'tiptap-body', spellcheck: 'false' },
      handlePaste: (_view, event) => {
        const dt = event.clipboardData
        if (!dt) return false
        const fromFiles = Array.from(dt.files ?? []).filter((f) => f.type.startsWith('image/'))
        const fromItems = Array.from(dt.items ?? [])
          .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
          .map((i) => i.getAsFile())
          .filter((f): f is File => !!f)
        const files = [...fromFiles, ...fromItems].filter(
          (f, i, arr) => arr.findIndex((x) => x === f) === i
        )
        if (files.length === 0) return false
        event.preventDefault()
        void insertImageFiles(files)
        return true
      },
      handleDrop: (_view, event) => {
        const files = Array.from((event as DragEvent).dataTransfer?.files ?? []).filter((f) =>
          f.type.startsWith('image/')
        )
        if (files.length === 0) return false
        event.preventDefault()
        void insertImageFiles(files)
        return true
      }
    },
    onUpdate: () => {
      scheduleSave()
    }
  })

  editorRef.current = editor

  // 粘贴为新笔记：进入编辑器后把剪贴板图片插进去
  useEffect(() => {
    if (!editor) return
    if (!pendingInsertImage || pendingInsertImage.noteId !== note.gid) return
    appendImage(editor, pendingInsertImage.relPath)
    setPendingInsertImage(null)
    scheduleSave()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, pendingInsertImage, note.gid])

  useEffect(() => {
    if (!editor) return
    // 标题默认是「未命名笔记」时，进来直接全选，省一次手动删
    if (note.title === UNTITLED || note.title.trim() === '') {
      window.setTimeout(() => {
        titleEl.current?.focus()
        titleEl.current?.select()
      }, 60)
    } else {
      window.setTimeout(() => editor.commands.focus('end'), 60)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      if (titleTimer.current) window.clearTimeout(titleTimer.current)
    }
  }, [])

  useImperativeHandle(ref, () => ({
    requestClose: async () => {
      // 输入法组合输入期间，任何"返回"判定都要被抑制（规格书 §6.1）
      if (composing.current) return
      if (closedRef.current) return
      const ok = await doSave()
      if (!ok) {
        showToast('保存失败，先不退出', 'error')
        return
      }
      closedRef.current = true
      onClosed()
    },
    flush: async () => {
      await doSave()
    }
  }))

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    const mod = e.ctrlKey || e.metaKey
    if (e.key === 'Escape' && !(e.nativeEvent as KeyboardEvent).isComposing) {
      e.preventDefault()
      e.stopPropagation()
      void doSave().then((ok) => {
        if (ok) {
          closedRef.current = true
          onClosed()
        } else {
          showToast('保存失败，先不退出', 'error')
        }
      })
      return
    }
    if (mod && !e.shiftKey && (e.key === '1' || e.key === '2' || e.key === '3')) {
      e.preventDefault()
      const level = Number(e.key) as 1 | 2 | 3
      editor?.chain().focus().toggleHeading({ level }).run()
      return
    }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'h') {
      e.preventDefault()
      editor?.chain().focus().toggleHighlight().run()
      return
    }
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault()
      void doSave().then((ok) => {
        if (ok) showToast('已保存')
        else showToast('保存失败', 'error')
      })
    }
  }

  return (
    <div
      className="editor-card"
      onKeyDown={handleKeyDown}
      onBlur={(e) => {
        // 失焦立即保存（规格书 §8.4）；焦点还在卡片内部就不打断
        const next = e.relatedTarget as Node | null
        if (next && e.currentTarget.contains(next)) return
        void doSave()
      }}
      onCompositionStart={() => {
        composing.current = true
      }}
      onCompositionEnd={() => {
        // 部分 IME 在 compositionend 后还会补一个 click，所以延后 100ms 释放
        window.setTimeout(() => {
          composing.current = false
        }, 100)
      }}
    >
      <div className="editor-head">
        <input
          ref={titleEl}
          className="editor-title"
          value={title}
          placeholder={UNTITLED}
          maxLength={120}
          onChange={(e) => {
            setTitle(e.target.value)
            setSaveState('saving')
            if (titleTimer.current) window.clearTimeout(titleTimer.current)
            titleTimer.current = window.setTimeout(() => {
              void doSave()
            }, C.AUTOSAVE_DEBOUNCE_MS)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              editor?.commands.focus('start')
            }
          }}
        />
        <button
          className="editor-tool"
          title="插入图片（也可以直接 Ctrl+V 粘贴，或把图片拖进来）"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void pickImage()}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="3.2" y="4.2" width="17.6" height="15.6" rx="2.6" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="8.6" cy="9.6" r="1.5" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M4.4 17.2l4.6-4.6 3 3 3.2-3.4 4.4 4.6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>图片</span>
        </button>
        <div className={`save-dot ${saveState}`}>
          {saveState === 'saving'
            ? '保存中…'
            : saveState === 'saved'
              ? '已保存'
              : saveState === 'error'
                ? '保存失败'
                : ''}
        </div>
      </div>      <div className="editor-divider" />

      {editor && (
        <BubbleMenu
          editor={editor}
          tippyOptions={{ duration: 120, maxWidth: 420 }}
          className="bubble-menu"
        >
          <button
            className={editor.isActive('bold') ? 'on' : ''}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="加粗 Ctrl+B"
          >
            <b>B</b>
          </button>
          <button
            className={editor.isActive('italic') ? 'on' : ''}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="斜体 Ctrl+I"
          >
            <i>I</i>
          </button>
          <button
            className={editor.isActive('strike') ? 'on' : ''}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            title="删除线 Ctrl+Shift+X"
          >
            <s>S</s>
          </button>
          <button
            className={editor.isActive('highlight') ? 'on' : ''}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            title="高亮 Ctrl+Shift+H"
          >
            ▮
          </button>
          <button
            className={editor.isActive('code') ? 'on' : ''}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleCode().run()}
            title="行内代码 Ctrl+E"
          >
            {'</>'}
          </button>
          <span className="bubble-sep" />
          <button
            className={editor.isActive('heading', { level: 1 }) ? 'on' : ''}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          >
            H1
          </button>
          <button
            className={editor.isActive('heading', { level: 2 }) ? 'on' : ''}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            H2
          </button>
        </BubbleMenu>
      )}

      <div className="editor-scroll">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
})
