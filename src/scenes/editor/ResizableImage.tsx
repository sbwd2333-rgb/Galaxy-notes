import { useRef } from 'react'
import Image from '@tiptap/extension-image'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'

/** 把模型里存的相对路径（assets/<gid>/xxx.png）转成自定义协议 URL */
export function toAssetUrl(src: string | null | undefined): string {
  if (!src) return ''
  if (/^(asset:|https?:|data:|blob:)/.test(src)) return src
  return `asset://local/${src.replace(/^\/+/, '')}`
}

function ImageNodeView({ node, updateAttributes, selected }: NodeViewProps): JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null)
  const resizing = useRef<{ startX: number; startW: number } | null>(null)

  const width: number | null = node.attrs.width ?? null

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    e.stopPropagation()
    const startW = wrapRef.current?.getBoundingClientRect().width ?? 0
    resizing.current = { startX: e.clientX, startW }

    const onMove = (ev: PointerEvent): void => {
      const r = resizing.current
      if (!r) return
      const next = Math.max(60, Math.round(r.startW + (ev.clientX - r.startX)))
      updateAttributes({ width: next })
    }
    const onUp = (): void => {
      resizing.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <NodeViewWrapper className={`img-node ${selected ? 'selected' : ''}`}>
      <div
        ref={wrapRef}
        className="img-wrap"
        style={width ? { width: `${width}px`, maxWidth: '100%' } : undefined}
      >
        <img src={toAssetUrl(node.attrs.src)} alt="" draggable={false} />
        <div className="img-handle" contentEditable={false} onPointerDown={onPointerDown} />
      </div>
    </NodeViewWrapper>
  )
}

/**
 * 图片扩展：attrs.src 存相对路径，渲染时才转 asset://；
 * 右下角手柄等比改宽度（规格书 §8.3）。
 */
export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...(this.parent?.() as Record<string, unknown>),
      width: {
        default: null,
        renderHTML: (attrs: { width?: number | null }) =>
          attrs.width ? { width: attrs.width } : {},
        parseHTML: (el: HTMLElement) => {
          const w = el.getAttribute('width')
          return w ? Number(w) : null
        }
      },
      src: {
        default: null,
        renderHTML: (attrs: { src?: string | null }) => ({
          src: toAssetUrl(attrs.src)
        }),
        parseHTML: (el: HTMLElement) => el.getAttribute('src')
      }
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView)
  }
})
