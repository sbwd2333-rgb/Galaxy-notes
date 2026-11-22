import { useMemo, useRef, useState } from 'react'
import { useVault } from '../store/vaultStore'
import { PALETTE } from '../lib/color'
import { UNTITLED } from '@shared/constants'
import type { Note, VaultItem } from '@shared/types'

interface SearchHit {
  note: Note
  titleHit: boolean
  snippet: string | null
}

interface SidebarProps {
  busy: boolean
  onCreate: () => void
  onSwitch: (item: VaultItem) => void
  onDelete: (item: VaultItem) => void
  onReveal: (item: VaultItem) => void
  onOpenNote: (gid: string) => void
}

function VaultGlyph({ index, active }: { index: number; active: boolean }): JSX.Element {
  const color = PALETTE[index % PALETTE.length]
  return (
    <span
      className={`vault-glyph ${active ? 'on' : ''}`}
      style={{
        background: `radial-gradient(circle at 34% 30%, ${color} 0%, ${color}88 42%, ${color}22 72%, transparent 78%)`,
        boxShadow: active ? `0 0 14px ${color}66` : 'none'
      }}
    />
  )
}

function Highlighted({ text, q }: { text: string; q: string }): JSX.Element {
  if (!q) return <>{text}</>
  const i = text.toLowerCase().indexOf(q)
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  )
}

export function Sidebar({
  busy,
  onCreate,
  onSwitch,
  onDelete,
  onReveal,
  onOpenNote
}: SidebarProps): JSX.Element {
  const vaults = useVault((s) => s.vaults)
  const notes = useVault((s) => s.notes)
  const switching = useVault((s) => s.switching)
  const [hovered, setHovered] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const active = useMemo(() => vaults.find((v) => v.active) ?? null, [vaults])

  const q = query.trim().toLowerCase()
  const searching = q.length > 0

  // 标题和正文都搜：标题命中的排前面，正文命中给一段上下文
  const results = useMemo<SearchHit[]>(() => {
    if (!q) return []
    const hits: SearchHit[] = []
    for (const n of notes) {
      const titleHit = (n.title || '').toLowerCase().includes(q)
      const text = n.text || ''
      const idx = text.toLowerCase().indexOf(q)
      if (!titleHit && idx < 0) continue

      let snippet: string | null = null
      if (idx >= 0) {
        const start = Math.max(0, idx - 16)
        const end = Math.min(text.length, idx + q.length + 34)
        const body = text.slice(start, end).replace(/\s+/g, ' ')
        snippet = `${start > 0 ? '…' : ''}${body}${end < text.length ? '…' : ''}`
      }
      hits.push({ note: n, titleHit, snippet })
    }
    hits.sort((a, b) => Number(b.titleHit) - Number(a.titleHit))
    return hits.slice(0, 60)
  }, [notes, q])

  const openResult = (gid: string): void => {
    onOpenNote(gid)
    setQuery('')
  }

  return (
    <aside className="sidebar" onContextMenu={(e) => e.preventDefault()}>
      <div className="sidebar-head">
        <span className="brand-mark" />
        <span className="brand-text">思维奇点</span>
        <span className="brand-en">GALAXY NOTES</span>
      </div>

      <button className="new-vault-btn" onClick={onCreate} disabled={busy}>
        <span className="plus">+</span>
        新建星系
      </button>

      <div className="search-box">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.7" />
          <path d="M15.6 15.6L21 21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        <input
          ref={searchRef}
          className="search-input"
          placeholder="搜索标题  Ctrl+K"
          value={query}
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              setQuery('')
              searchRef.current?.blur()
            } else if (e.key === 'Enter' && results[0]) {
              e.preventDefault()
              openResult(results[0].note.gid)
            }
          }}
        />
        {query && (
          <button className="search-clear" onClick={() => setQuery('')} title="清空">
            ×
          </button>
        )}
      </div>

      <div className="vault-list">
        {searching ? (
          <>
            <div className="search-count">
              {results.length > 0 ? `${results.length} 篇匹配` : '没有匹配'}
            </div>
            {results.map((r) => (
              <button
                key={r.note.gid}
                className="search-result"
                onClick={() => openResult(r.note.gid)}
              >
                <span className="result-dot" style={{ background: r.note.color }} />
                <span className="result-body">
                  <span className={`result-title ${r.titleHit ? '' : 'dim'}`}>
                    <Highlighted text={r.note.title.trim() || UNTITLED} q={q} />
                  </span>
                  {r.snippet && (
                    <span className="result-snippet">
                      <Highlighted text={r.snippet} q={q} />
                    </span>
                  )}
                </span>
              </button>
            ))}
            {results.length === 0 && (
              <div className="search-empty">
                没有标题或正文包含「{query.trim()}」的笔记。搜的是当前星系里的文字。
              </div>
            )}
          </>
        ) : (
          <>
            {vaults.map((v, i) => (
              <div
                key={v.path}
                className={`vault-item ${v.active ? 'on' : ''}`}
                onMouseEnter={() => setHovered(v.path)}
                onMouseLeave={() => setHovered(null)}
              >
                <button
                  className="vault-main"
                  onClick={() => onSwitch(v)}
                  title={v.path}
                  disabled={switching}
                >
                  <VaultGlyph index={i} active={v.active} />
                  <span className="vault-body">
                    <span className="vault-name">{v.name}</span>
                    <span className="vault-meta">
                      {v.noteCount} 篇笔记
                      {v.active ? ' · 当前' : ''}
                    </span>
                  </span>
                </button>
                {hovered === v.path && (
                  <button
                    className="vault-remove"
                    title="删除星系（会先进回收站）"
                    onClick={() => onDelete(v)}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}

            {vaults.length === 0 && <div className="vault-empty">还没有星系，点上面新建一个</div>}
          </>
        )}
      </div>

      <div className="sidebar-foot">
        {active && (
          <button className="reveal-btn" onClick={() => onReveal(active)} title={active.path}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2h9A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-10Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            <span className="reveal-name">{active.name}</span>
          </button>
        )}
        <div className="sidebar-hint">右键空白 · 新建笔记</div>
      </div>
    </aside>
  )
}
