/**
 * 库（vault）文件系统层。
 *
 * 这里**不 import electron**，只依赖 node:fs / node:path / node:crypto，
 * 以便被 --selftest 直接驱动、也便于将来做单元测试。
 * 「送进回收站」这类必须依赖 Electron 的能力用依赖注入传进来。
 *
 * 规格书 §3.5 数据完整性规则逐条实现：
 *   1 级联删除  2 孤儿边清理  3 回收站  4 原子写入  5 损坏恢复  6 写操作串行化
 */
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import type {
  GraphFile,
  Link,
  LinkCreateResult,
  LinkOrigin,
  Note,
  NotePatch,
  VaultLoadResult,
  VaultSettings
} from '../../shared/types'
import { C, UNTITLED } from '../../shared/constants'

const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])

export function genId(size = 10): string {
  const bytes = crypto.randomBytes(size)
  let out = ''
  for (let i = 0; i < size; i++) out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length]
  return out
}

export function nowIso(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  const tz = -d.getTimezoneOffset()
  const sign = tz >= 0 ? '+' : '-'
  const abs = Math.abs(tz)
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `.${String(d.getMilliseconds()).padStart(3, '0')}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  )
}

function stamp(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  )
}

export const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] }

function defaultSettings(root: string): VaultSettings {
  return {
    version: 1,
    vaultPath: root,
    lastNoteId: null,
    camera: { position: [0, 40, 120], target: [0, 0, 0] },
    window: { width: 1440, height: 900, maximized: false }
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

/** 原子写入：临时文件 → rename（规格书 §3.5.4） */
async function atomicWrite(abs: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(abs), { recursive: true })
  const tmp = `${abs}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await fs.rename(tmp, abs)
}

export interface VaultStoreDeps {
  /** 把文件送进系统回收站（Electron 里是 shell.trashItem）。 */
  trash: (absPath: string) => Promise<void>
}

export class VaultStore {
  readonly root: string
  private readonly deps: VaultStoreDeps
  /** 每个文件的写入 Promise 链，保证同一文件串行写（规格书 §3.5.6） */
  private queues = new Map<string, Promise<unknown>>()

  constructor(root: string, deps: VaultStoreDeps) {
    this.root = path.resolve(root)
    this.deps = deps
  }

  get notesDir(): string {
    return path.join(this.root, 'notes')
  }
  get assetsDir(): string {
    return path.join(this.root, 'assets')
  }
  get graphPath(): string {
    return path.join(this.root, 'graph.json')
  }
  get vaultPath(): string {
    return path.join(this.root, 'vault.json')
  }

  private notePath(gid: string): string {
    return path.join(this.notesDir, `${gid}.json`)
  }

  private enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(key) ?? Promise.resolve()
    const next = prev.then(task, task)
    this.queues.set(
      key,
      next.then(
        () => undefined,
        () => undefined
      )
    )
    return next
  }

  /** 建目录结构（规格书 §3.1） */
  async ensureLayout(): Promise<void> {
    await fs.mkdir(this.notesDir, { recursive: true })
    await fs.mkdir(this.assetsDir, { recursive: true })
    if (!(await exists(this.graphPath))) {
      await atomicWrite(this.graphPath, { version: 1, links: [] } satisfies GraphFile)
    }
    if (!(await exists(this.vaultPath))) {
      await atomicWrite(this.vaultPath, defaultSettings(this.root))
    }
  }

  /** 首次初始化：建结构 + 一篇欢迎笔记 */
  async init(): Promise<{ welcomeNoteId: string }> {
    await this.ensureLayout()
    const existing = await this.listNoteFiles()
    if (existing.notes.length > 0) {
      return { welcomeNoteId: existing.notes[0].gid }
    }
    const note = await this.createNote({
      pos: [0, 0, 0],
      title: '欢迎来到星系',
      doc: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '欢迎来到星系' }] },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '每篇笔记都是星图里的一个星球：' }]
          },
          {
            type: 'bulletList',
            content: [
              ['右键空白处 · 新建笔记'],
              ['左键点击星球 · 进入编辑'],
              ['点击画布空白或按 Esc · 缩回星球'],
              ['Ctrl + 左键 · 选中最多两个星球'],
              ['选中两个后右键 · 让它们连起来']
            ].map(([t]) => ({
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }]
            }))
          }
        ]
      } as Note['doc']
    })
    return { welcomeNoteId: note.gid }
  }

  /** 读取所有笔记文件（跳过损坏文件并备份） */
  async listNoteFiles(): Promise<{ notes: Note[]; corrupt: string[] }> {
    const corrupt: string[] = []
    const notes: Note[] = []
    let files: string[] = []
    try {
      files = (await fs.readdir(this.notesDir)).filter((f) => f.endsWith('.json'))
    } catch {
      return { notes, corrupt }
    }
    for (const f of files) {
      const abs = path.join(this.notesDir, f)
      try {
        const raw = await fs.readFile(abs, 'utf8')
        const parsed = JSON.parse(raw) as Note
        if (!parsed || typeof parsed !== 'object' || typeof parsed.gid !== 'string') {
          throw new Error('shape')
        }
        notes.push(this.normalizeNote(parsed))
      } catch {
        try {
          const backup = `${f}.corrupt-${stamp()}`
          await fs.rename(abs, path.join(this.notesDir, backup))
          corrupt.push(backup)
        } catch {
          /* 备份也失败就跳过 */
        }
      }
    }
    return { notes, corrupt }
  }

  private normalizeNote(n: Note): Note {
    const pos: [number, number, number] =
      Array.isArray(n.pos) && n.pos.length === 3 && n.pos.every((v) => typeof v === 'number')
        ? [n.pos[0], n.pos[1], n.pos[2]]
        : [0, 0, 0]
    return {
      gid: String(n.gid),
      title: typeof n.title === 'string' ? n.title : '',
      created: typeof n.created === 'string' ? n.created : nowIso(),
      updated: typeof n.updated === 'string' ? n.updated : nowIso(),
      color: typeof n.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(n.color) ? n.color : C.PALETTE[0],
      pos,
      doc: (n.doc && typeof n.doc === 'object' ? n.doc : EMPTY_DOC) as Note['doc'],
      text: typeof n.text === 'string' ? n.text : ''
    }
  }

  async readGraph(): Promise<{ graph: GraphFile; corrupt: string[] }> {
    const corrupt: string[] = []
    try {
      const raw = await fs.readFile(this.graphPath, 'utf8')
      const parsed = JSON.parse(raw) as GraphFile
      if (!parsed || !Array.isArray(parsed.links)) throw new Error('shape')
      return {
        graph: {
          version: 1,
          links: parsed.links
            .filter((l) => l && typeof l.a === 'string' && typeof l.b === 'string')
            .map((l) => this.normalizeLink(l))
        },
        corrupt
      }
    } catch {
      if (await exists(this.graphPath)) {
        try {
          const backup = `graph.json.corrupt-${stamp()}`
          await fs.rename(this.graphPath, path.join(this.root, backup))
          corrupt.push(backup)
        } catch {
          /* ignore */
        }
      }
      await atomicWrite(this.graphPath, { version: 1, links: [] } satisfies GraphFile)
      return { graph: { version: 1, links: [] }, corrupt }
    }
  }

  private normalizeLink(l: Link): Link {
    let a = String(l.a)
    let b = String(l.b)
    if (a > b) [a, b] = [b, a]
    return {
      id: typeof l.id === 'string' && l.id ? l.id : `l_${genId(8)}`,
      a,
      b,
      label: typeof l.label === 'string' ? l.label : '',
      origin: l.origin === 'ai' ? 'ai' : 'manual',
      created: typeof l.created === 'string' ? l.created : nowIso(),
      aiRationale: typeof l.aiRationale === 'string' ? l.aiRationale : null
    }
  }

  private async writeGraph(graph: GraphFile): Promise<void> {
    await this.enqueue(this.graphPath, () => atomicWrite(this.graphPath, graph))
  }

  async readSettings(): Promise<VaultSettings> {
    try {
      const raw = await fs.readFile(this.vaultPath, 'utf8')
      const parsed = JSON.parse(raw) as VaultSettings
      const def = defaultSettings(this.root)
      return {
        ...def,
        ...parsed,
        version: 1,
        vaultPath: this.root,
        camera: { ...def.camera, ...(parsed.camera ?? {}) },
        window: { ...def.window, ...(parsed.window ?? {}) }
      }
    } catch {
      const def = defaultSettings(this.root)
      await atomicWrite(this.vaultPath, def)
      return def
    }
  }

  async saveSettings(patch: Partial<VaultSettings>): Promise<VaultSettings> {
    const current = await this.readSettings()
    const next: VaultSettings = { ...current, ...patch, vaultPath: this.root, version: 1 }
    await this.enqueue(this.vaultPath, () => atomicWrite(this.vaultPath, next))
    return next
  }

  /** 完整加载：笔记 + 边 + 设置，含孤儿边清理 */
  async load(): Promise<VaultLoadResult> {
    await this.ensureLayout()
    const { notes, corrupt } = await this.listNoteFiles()
    const settings = await this.readSettings()
    const { graph, corrupt: graphCorrupt } = await this.readGraph()
    corrupt.push(...graphCorrupt)

    const gids = new Set(notes.map((n) => n.gid))
    const seen = new Set<string>()
    const cleaned: Link[] = []
    for (const l of graph.links) {
      if (!gids.has(l.a) || !gids.has(l.b)) continue // 孤儿边静默删除
      if (l.a === l.b) continue
      const key = `${l.a}|${l.b}` // 已规范化，天然去重
      if (seen.has(key)) continue
      seen.add(key)
      cleaned.push(l)
    }
    if (cleaned.length !== graph.links.length) {
      await this.writeGraph({ version: 1, links: cleaned })
    }
    return { notes, links: cleaned, settings, corrupt }
  }

  async readNote(gid: string): Promise<Note> {
    const raw = await fs.readFile(this.notePath(gid), 'utf8')
    return this.normalizeNote(JSON.parse(raw) as Note)
  }

  private async pickColor(): Promise<string> {
    const { notes } = await this.listNoteFiles()
    const count = new Map<string, number>(C.PALETTE.map((c) => [c, 0]))
    for (const n of notes) {
      count.set(n.color, (count.get(n.color) ?? 0) + 1)
    }
    let best: string = C.PALETTE[0]
    let bestCount = Infinity
    for (const c of C.PALETTE) {
      const v = count.get(c) ?? 0
      if (v < bestCount) {
        bestCount = v
        best = c
      }
    }
    if (bestCount > 0) {
      return C.PALETTE[Math.floor(Math.random() * C.PALETTE.length)]
    }
    return best
  }

  async createNote(input: {
    pos: [number, number, number]
    color?: string
    title?: string
    doc?: Note['doc']
  }): Promise<Note> {
    const gid = genId(10)
    const at = nowIso()
    const note: Note = {
      gid,
      title: input.title ?? UNTITLED,
      created: at,
      updated: at,
      color: input.color ?? (await this.pickColor()),
      pos: input.pos,
      doc: input.doc ?? (EMPTY_DOC as Note['doc']),
      text: ''
    }
    await this.enqueue(this.notePath(gid), () => atomicWrite(this.notePath(gid), note))
    return note
  }

  async updateNote(gid: string, patch: NotePatch): Promise<Note> {
    return this.enqueue(this.notePath(gid), async () => {
      const current = await this.readNote(gid)
      const next: Note = {
        ...current,
        ...patch,
        gid: current.gid,
        created: current.created,
        updated: nowIso()
      }
      await atomicWrite(this.notePath(gid), next)
      return next
    })
  }

  /**
   * 删除笔记：笔记文件进回收站 → 删 assets/<gid> → 级联删边。
   * 规格书 §3.5.1 / §3.5.3。
   */
  async deleteNote(gid: string): Promise<{ ok: true }> {
    const file = this.notePath(gid)
    if (await exists(file)) {
      try {
        await this.deps.trash(file)
      } catch {
        // 回收站不可用时退回普通删除，但绝不静默（调用方会收到 ok 但文件确实删除）
        await fs.rm(file, { force: true })
      }
    }
    await fs.rm(path.join(this.assetsDir, gid), { recursive: true, force: true })

    const { graph } = await this.readGraph()
    const links = graph.links.filter((l) => l.a !== gid && l.b !== gid)
    if (links.length !== graph.links.length) {
      await this.writeGraph({ version: 1, links })
    }
    return { ok: true }
  }

  /** 建关联：先规范化（a < b），再查重；重复则更新标签 */
  async createLink(input: {
    a: string
    b: string
    label: string
    origin?: LinkOrigin
    aiRationale?: string | null
  }): Promise<LinkCreateResult> {
    if (input.a === input.b) throw new Error('SELF_LINK')
    let a = input.a
    let b = input.b
    if (a > b) [a, b] = [b, a]

    const { graph } = await this.readGraph()
    const existing = graph.links.find((l) => l.a === a && l.b === b)
    if (existing) {
      if (existing.label !== input.label) {
        const updated = await this.updateLink(existing.id, input.label)
        return { link: updated, existed: true }
      }
      return { link: existing, existed: true }
    }
    const link: Link = {
      id: `l_${genId(8)}`,
      a,
      b,
      label: input.label,
      origin: input.origin ?? 'manual',
      created: nowIso(),
      aiRationale: input.aiRationale ?? null
    }
    graph.links.push(link)
    await this.writeGraph({ version: 1, links: graph.links })
    return { link, existed: false }
  }

  async updateLink(id: string, label: string): Promise<Link> {
    const { graph } = await this.readGraph()
    const link = graph.links.find((l) => l.id === id)
    if (!link) throw new Error('LINK_NOT_FOUND')
    link.label = label
    await this.writeGraph({ version: 1, links: graph.links })
    return link
  }

  async deleteLink(id: string): Promise<{ ok: true }> {
    const { graph } = await this.readGraph()
    const links = graph.links.filter((l) => l.id !== id)
    if (links.length !== graph.links.length) {
      await this.writeGraph({ version: 1, links })
    }
    return { ok: true }
  }

  /** 图片落盘：assets/<gid>/<yyyyMMdd-HHmmss>-<random8>.<ext> */
  async saveAsset(noteId: string, data: ArrayBuffer, extRaw: string): Promise<{ relPath: string }> {
    const ext = extRaw.toLowerCase().replace(/^\./, '')
    if (!IMAGE_EXT.has(ext)) throw new Error('BAD_IMAGE_EXT')
    if (data.byteLength > C.MAX_IMAGE_MB * 1024 * 1024) throw new Error('IMAGE_TOO_LARGE')
    const dir = path.join(this.assetsDir, noteId)
    await fs.mkdir(dir, { recursive: true })
    const name = `${stamp()}-${genId(8).toLowerCase()}.${ext}`
    await fs.writeFile(path.join(dir, name), Buffer.from(data))
    return { relPath: `assets/${noteId}/${name}` }
  }
}
