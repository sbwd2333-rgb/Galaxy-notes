/**
 * 数据层自测：`electron . --selftest`（不需要窗口，跑完打印 SELFTEST_RESULT 并退出）。
 * 覆盖规格书 §10 里 A1 / A6 / A7 / A8 / A11 中纯数据层的部分。
 */
import { promises as fs } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { VaultStore } from './ipc/store'

interface SelfTestResult {
  pass: string[]
  fail: string[]
  dir: string
}

export async function runSelfTest(): Promise<SelfTestResult> {
  const pass: string[] = []
  const fail: string[] = []
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'galaxy-selftest-'))
  const dir = path.join(tmpRoot, 'vault')
  const trashed: string[] = []

  const check = (name: string, cond: boolean, extra?: unknown): void => {
    if (cond) pass.push(name)
    else fail.push(name + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra)))
  }

  const store = new VaultStore(dir, {
    trash: async (p) => {
      trashed.push(p)
      await fs.rm(p, { force: true })
    }
  })

  // ---- A1 首次初始化 ----
  const { welcomeNoteId } = await store.init()
  check('A1 欢迎笔记已生成', typeof welcomeNoteId === 'string' && welcomeNoteId.length === 10)
  check('A1 notes 目录存在', await fs.stat(store.notesDir).then((s) => s.isDirectory()).catch(() => false))
  check('A1 assets 目录存在', await fs.stat(store.assetsDir).then((s) => s.isDirectory()).catch(() => false))
  check('A1 graph.json 存在', await fs.stat(store.graphPath).then((s) => s.isFile()).catch(() => false))
  check('A1 vault.json 存在', await fs.stat(store.vaultPath).then((s) => s.isFile()).catch(() => false))

  // ---- 笔记 CRUD ----
  const noteA = await store.createNote({ pos: [1, 2, 3], color: '#6ea8ff', title: 'A 笔记' })
  check('note:create 落盘', await fs.stat(path.join(store.notesDir, `${noteA.gid}.json`)).then((s) => s.isFile()).catch(() => false))
  const readA = await store.readNote(noteA.gid)
  check('note:read 往返一致', readA.title === 'A 笔记' && readA.color === '#6ea8ff')
  const updatedA = await store.updateNote(noteA.gid, { title: 'A 改名', text: '纯文本快照' })
  check('note:update 生效', updatedA.title === 'A 改名' && updatedA.text === '纯文本快照')
  const rereadA = await store.readNote(noteA.gid)
  check('note:update 已落盘', rereadA.title === 'A 改名')
  check('note:update 保留了 created', rereadA.created === noteA.created)

  const noteB = await store.createNote({ pos: [4, 5, 6], color: '#7ee0b8', title: 'B 笔记' })

  // ---- 关联：无向规范化 ----
  const big = noteA.gid > noteB.gid ? noteA.gid : noteB.gid
  const small = noteA.gid > noteB.gid ? noteB.gid : noteA.gid
  const l1 = await store.createLink({ a: big, b: small, label: '同一问题的两面' })
  check('link:create 新建', l1.existed === false)
  check('link:create 无向规范化 a<b', l1.link.a < l1.link.b, { a: l1.link.a, b: l1.link.b })
  check('link:create 反向入参仍是同一条', l1.link.a === small && l1.link.b === big)

  // ---- A7 去重 ----
  const l2 = await store.createLink({ a: small, b: big, label: '同一问题的两面' })
  check('A7 重复建链被识别', l2.existed === true)
  check('A7 重复建链未新增', l2.link.id === l1.link.id)
  const { graph: g1 } = await store.readGraph()
  check('A7 磁盘上只有一条', g1.links.length === 1, g1.links.length)

  const l3 = await store.createLink({ a: small, b: big, label: '互为前提' })
  check('A7 重复建链＝更新标签', l3.link.label === '互为前提' && l3.existed === true)

  // ---- 自环禁止 ----
  let selfLinkRejected = false
  try {
    await store.createLink({ a: noteA.gid, b: noteA.gid, label: 'x' })
  } catch {
    selfLinkRejected = true
  }
  check('自环被拒绝', selfLinkRejected)

  // ---- A8 级联删除 ----
  const noteC = await store.createNote({ pos: [0, 0, 0], title: 'C 笔记' })
  await store.createLink({ a: noteA.gid, b: noteC.gid, label: '案例与理论' })
  await store.saveAsset(noteC.gid, new Uint8Array([137, 80, 78, 71]).buffer, 'png')
  const assetDir = path.join(store.assetsDir, noteC.gid)
  check('asset 目录已建', await fs.stat(assetDir).then((s) => s.isDirectory()).catch(() => false))

  await store.deleteNote(noteC.gid)
  check('A8 笔记文件进回收站（trash 被调用）', trashed.some((p) => p.endsWith(`${noteC.gid}.json`)), trashed)
  check('A8 笔记文件已不存在', !(await fs.stat(path.join(store.notesDir, `${noteC.gid}.json`)).then((s) => s.isFile()).catch(() => false)))
  check('A8 assets 子目录被删', !(await fs.stat(assetDir).then(() => true).catch(() => false)))
  const { graph: g2 } = await store.readGraph()
  check('A8 相关边被级联删除', g2.links.every((l) => l.a !== noteC.gid && l.b !== noteC.gid), g2.links)

  // ---- A11 损坏恢复 ----
  await fs.writeFile(store.graphPath, '{ "version": 1, "links": [', 'utf8')
  const loaded = await store.load()
  check('A11 损坏文件被备份', loaded.corrupt.some((f) => f.startsWith('graph.json.corrupt-')), loaded.corrupt)
  check('A11 损坏后重建为空图', loaded.links.length === 0)
  check('A11 损坏后笔记仍在', loaded.notes.length >= 2, loaded.notes.length)
  const backups = (await fs.readdir(dir)).filter((f) => f.startsWith('graph.json.corrupt-'))
  check('A11 备份文件真实存在', backups.length === 1, backups)

  // ---- 孤儿边清理 ----
  const { graph: g3 } = await store.readGraph()
  g3.links.push({
    id: 'l_orphan1',
    a: 'zzzzzzzzzz',
    b: noteA.gid,
    label: '孤儿',
    origin: 'manual',
    created: new Date().toISOString(),
    aiRationale: null
  })
  await fs.writeFile(store.graphPath, JSON.stringify(g3, null, 2), 'utf8')
  const loaded2 = await store.load()
  check('孤儿边被清理', loaded2.links.every((l) => l.a !== 'zzzzzzzzzz'))
  const { graph: g4 } = await store.readGraph()
  check('孤儿边清理已写回磁盘', g4.links.every((l) => l.a !== 'zzzzzzzzzz'))

  // ---- 原子写入：不留临时文件 ----
  const leftovers: string[] = []
  for (const d of [dir, store.notesDir]) {
    const files = await fs.readdir(d)
    leftovers.push(...files.filter((f) => f.includes('.tmp-')))
  }
  check('原子写入无 .tmp- 残留', leftovers.length === 0, leftovers)

  // ---- 图片校验 ----
  let bigRejected = false
  try {
    const big = new Uint8Array(21 * 1024 * 1024)
    await store.saveAsset(noteA.gid, big.buffer, 'png')
  } catch {
    bigRejected = true
  }
  check('超过 20MB 的图片被拒绝', bigRejected)

  let badExtRejected = false
  try {
    await store.saveAsset(noteA.gid, new Uint8Array([1]).buffer, 'exe')
  } catch {
    badExtRejected = true
  }
  check('非图片扩展名被拒绝', badExtRejected)

  // ---- 设置往返 ----
  await store.saveSettings({ lastNoteId: noteA.gid, camera: { position: [1, 2, 3], target: [0, 0, 0] } })
  const st = await store.readSettings()
  check(
    '设置往返一致',
    st.lastNoteId === noteA.gid && st.camera.position.join(',') === '1,2,3'
  )

  await fs.rm(tmpRoot, { recursive: true, force: true })
  return { pass, fail, dir }
}
