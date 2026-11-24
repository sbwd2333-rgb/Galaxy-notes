/**
 * 主进程 / 渲染进程共享的类型与常量。
 * 字段命名与《星系笔记 · 实施规格书 v1.0》§3 保持一致；
 * 关联边用 a / b 而不是 from / to —— 从类型层杜绝"方向"被偷偷加回来。
 */

export interface ProseMirrorDoc {
  type: 'doc'
  content?: unknown[]
  [key: string]: unknown
}

export interface Note {
  gid: string
  title: string
  created: string
  updated: string
  color: string
  pos: [number, number, number]
  /** 手动星球大小倍率（0.6~2.5，1 为基准）；用来把重点笔记放大 */
  scale?: number
  doc: ProseMirrorDoc
  /** 纯文本快照，每次保存同步更新，供未来 AI / 搜索使用 */
  text: string
}

export type LinkOrigin = 'manual' | 'ai'

export interface Link {
  id: string
  a: string
  b: string
  label: string
  origin: LinkOrigin
  created: string
  aiRationale: string | null
}

export interface GraphFile {
  version: 1
  links: Link[]
}

export interface CameraState {
  position: [number, number, number]
  target: [number, number, number]
}

export interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  maximized: boolean
}

export interface AiSettings {
  baseUrl: string
  encryptedKey: string
  model: string
}

export interface VaultSettings {
  version: 1
  vaultPath: string
  lastNoteId: string | null
  camera: CameraState
  window: WindowState
  ai?: AiSettings
}

export interface LinkCreateResult {
  link: Link
  /** true 表示这对笔记已经存在关联，本次只更新了标签 */
  existed: boolean
}

/** 左侧侧边栏里的一个「星系」（= 一个库目录） */
export interface VaultItem {
  path: string
  name: string
  noteCount: number
  active: boolean
}

export interface VaultDeleteResult {
  /** whole = 整个文件夹进了回收站；partial = 只删了星系数据，文件夹保留 */
  scope: 'whole' | 'partial'
  remaining: VaultItem[]
  /** 删的是当前星系时，自动切换到的下一个（没有则为 null） */
  nextActive: VaultItem | null
  deletedActive: boolean
}

export interface VaultCreateResult {
  ok: boolean
  item?: VaultItem
  reason?: 'cancelled' | 'blocked'
  /** 被路径护栏拦下时的说明 */
  message?: string
}

/** 右下角书签里的待办 */
export interface Todo {
  id: string
  text: string
  done: boolean
  createdAt: string
  doneAt: string | null
}

export interface VaultLoadResult {
  notes: Note[]
  links: Link[]
  settings: VaultSettings
  /** 加载时被备份为 .corrupt-* 的文件名，用于顶部 Toast */
  corrupt: string[]
}

export type ContextMenuItemId =
  | 'new-note'
  | 'paste-note'
  | 'open'
  | 'rename'
  | 'recolor'
  | 'delete'
  | 'copy-id'
  | 'make-link'
  | 'deselect'

export interface ContextMenuItem {
  id: ContextMenuItemId
  label: string
  enabled?: boolean
  danger?: boolean
}

export interface ContextMenuPayload {
  items: ContextMenuItem[]
}

export interface NotePatch {
  title?: string
  doc?: ProseMirrorDoc
  text?: string
  color?: string
  pos?: [number, number, number]
  scale?: number
}

export interface Api {
  // 库
  vaultSelect(): Promise<string | null>
  vaultInit(path: string): Promise<{ ok: true; welcomeNoteId: string } | { ok: false; message: string }>
  vaultLoad(): Promise<VaultLoadResult>
  vaultSaveSettings(patch: Partial<VaultSettings>): Promise<void>
  vaultPickFolder?(): Promise<string | null>
  /** 预检一个目录能不能当星系库（护栏） */
  vaultCheckPath(path: string): Promise<{ ok: boolean; message?: string }>

  // 多星系
  vaultList(): Promise<VaultItem[]>
  vaultCreate(): Promise<VaultCreateResult>
  vaultSwitch(path: string): Promise<VaultItem>
  vaultRemove(path: string): Promise<VaultItem[]>
  vaultDelete(path: string): Promise<VaultDeleteResult>
  vaultReveal(path: string): Promise<boolean>
  vaultRename(path: string, name: string): Promise<VaultItem | null>

  // 笔记
  noteCreate(input: { pos: [number, number, number]; color?: string; title?: string }): Promise<Note>
  noteRead(id: string): Promise<Note>
  noteUpdate(id: string, patch: NotePatch): Promise<Note>
  noteDelete(id: string): Promise<{ ok: true }>

  // 关联
  linkCreate(input: {
    a: string
    b: string
    label: string
    origin?: LinkOrigin
    aiRationale?: string | null
  }): Promise<LinkCreateResult>
  linkUpdate(id: string, label: string): Promise<Link>
  linkDelete(id: string): Promise<{ ok: true }>

  // 图片
  assetSave(input: { noteId: string; data: ArrayBuffer; ext: string }): Promise<{ relPath: string }>
  pickImage(noteId: string): Promise<{ relPath: string } | null>
  clipboardReadImage(): Promise<{ data: ArrayBuffer; ext: string } | null>

  // 待办
  todosList(): Promise<Todo[]>
  todosAdd(text: string): Promise<Todo>
  todosToggle(id: string): Promise<Todo | null>
  todosRemove(id: string): Promise<Todo[]>
  todosClearDone(): Promise<Todo[]>

  // 系统
  showContextMenu(payload: ContextMenuPayload): Promise<ContextMenuItemId | null>
  notify(level: 'info' | 'error', message: string): Promise<void>
  writeClipboard(text: string): Promise<void>
  setWindowTitle(title: string): Promise<void>
  readyToClose(): void
  /** 主进程在窗口关闭前要求渲染进程保存；返回取消订阅函数 */
  onFlushRequest(cb: () => void): () => void
}

export interface NoteView extends Note {
  degree: number
}
