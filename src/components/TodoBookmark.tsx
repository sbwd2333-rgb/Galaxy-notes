import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Todo } from '@shared/types'

/**
 * 右下角的待办书签：点一下展开今天要做的事，勾选完成、右侧删除。
 * 数据存在主进程的 userData/todos.json，和笔记库无关（换星系不影响）。
 */
export function TodoBookmark(): JSX.Element {
  const [open, setOpen] = useState(false)
  const [todos, setTodos] = useState<Todo[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const list = await window.api.todosList()
      setTodos(list)
    } catch {
      /* 读不到就当空 */
    }
  }, [])

  // 打开时重新拉一次（跨天/多窗口时也能拿到最新）
  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (open) {
      void refresh()
      window.setTimeout(() => inputRef.current?.focus(), 120)
    }
  }, [open, refresh])

  // Esc 收起
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  const pending = todos.filter((t) => !t.done).length

  const sorted = useMemo(() => {
    return [...todos].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1
      if (a.done && b.done) {
        const da = a.doneAt ?? a.createdAt
        const db = b.doneAt ?? b.createdAt
        return da < db ? 1 : -1
      }
      return a.createdAt < b.createdAt ? -1 : 1
    })
  }, [todos])

  const add = async (): Promise<void> => {
    const text = draft.trim()
    if (!text || busy) return
    setBusy(true)
    try {
      const todo = await window.api.todosAdd(text)
      setTodos((prev) => [...prev, todo])
      setDraft('')
      inputRef.current?.focus()
    } catch {
      /* 空串等异常忽略 */
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (id: string): Promise<void> => {
    const updated = await window.api.todosToggle(id)
    if (!updated) return
    setTodos((prev) => prev.map((t) => (t.id === id ? updated : t)))
  }

  const remove = async (id: string): Promise<void> => {
    const next = await window.api.todosRemove(id)
    setTodos(next)
  }

  const clearDone = async (): Promise<void> => {
    const next = await window.api.todosClearDone()
    setTodos(next)
  }

  const today = useMemo(
    () =>
      new Date().toLocaleDateString('zh-CN', {
        month: 'long',
        day: 'numeric',
        weekday: 'short'
      }),
    []
  )

  return (
    <>
      <button
        className={`todo-bookmark ${open ? 'open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title={open ? '收起待办' : '今日待办'}
      >
        <span className="todo-bookmark-text">待办</span>
        {pending > 0 && <span className="todo-badge">{pending > 99 ? '99+' : pending}</span>}
      </button>

      {open && (
        <div className="todo-panel" ref={panelRef}>
          <div className="todo-head">
            <span className="todo-title">今日待办</span>
            <span className="todo-date">{today}</span>
            <button className="todo-close" onClick={() => setOpen(false)} title="收起">
              ×
            </button>
          </div>

          <div className="todo-input-row">
            <input
              ref={inputRef}
              className="todo-input"
              placeholder="加一条…（回车）"
              value={draft}
              maxLength={200}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void add()
                }
              }}
            />
            <button className="todo-add" onClick={() => void add()} disabled={!draft.trim() || busy}>
              +
            </button>
          </div>

          <div className="todo-list">
            {sorted.length === 0 && <div className="todo-empty">今天还没有待办</div>}
            {sorted.map((t) => (
              <div key={t.id} className={`todo-item ${t.done ? 'done' : ''}`}>
                <button
                  className={`todo-check ${t.done ? 'on' : ''}`}
                  onClick={() => void toggle(t.id)}
                  title={t.done ? '标记为未完成' : '标记完成'}
                  aria-pressed={t.done}
                >
                  {t.done ? '✓' : ''}
                </button>
                <span className="todo-text" title={t.text}>
                  {t.text}
                </span>
                <button className="todo-del" onClick={() => void remove(t.id)} title="删除">
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="todo-foot">
            <span className="todo-count">{pending} 项未完成</span>
            {todos.some((t) => t.done) && (
              <button className="todo-clear" onClick={() => void clearDone()}>
                清除已完成
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
