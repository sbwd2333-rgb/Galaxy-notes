import type { VaultStore } from './ipc/store'
import { C } from '../shared/constants'

/**
 * `--smoke` 开发自检用：造一组固定的假数据（12 篇 + 若干关联），
 * 让截图能验证星系、纹理、连线是否真的画出来了。不进入正式产品路径。
 */
export async function seedSmokeVault(store: VaultStore): Promise<void> {
  const existing = await store.listNoteFiles()
  if (existing.notes.length > 1) return

  const titles = [
    '欢迎来到星系',
    '关于注意力的一点观察',
    '读《人类简史》笔记',
    '产品直觉从哪里来',
    '深夜写下的失败复盘',
    '分布式系统里的权衡',
    '一个关于颜色的实验',
    '为什么我们记不住上周二',
    '无向关系与知识网络',
    '写作是最慢的思考',
    '设计稿第 12 版',
    '给三年后的自己'
  ]

  const colors = [...C.PALETTE]
  const created: string[] = []

  for (let i = 0; i < titles.length; i++) {
    // Fibonacci 球面分布（规格书 §7.2），外加大一点半径让星系铺得开
    const n = titles.length
    const y = 1 - (i / (n - 1)) * 2
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = i * 2.399963
    const radius = 62
    const pos: [number, number, number] = [
      Math.cos(theta) * r * radius,
      y * radius * 0.8 + (i % 3) * 2,
      Math.sin(theta) * r * radius
    ]
    const note = await store.createNote({
      pos,
      color: colors[i % colors.length],
      title: titles[i],
      doc: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: titles[i] }]
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: '这是一颗用于开发自检的假星球。它的纹理由 gid 决定，同一篇笔记每次启动长得一样。'
              }
            ]
          }
        ]
      } as never
    })
    created.push(note.gid)
  }

  const pairs: [number, number, string][] = [
    [0, 1, '同一问题的两面'],
    [1, 2, '互为前提'],
    [2, 3, '案例与理论'],
    [3, 4, '互相印证'],
    [4, 5, '同一线索'],
    [5, 6, '对照实验'],
    [6, 7, '互为前提'],
    [7, 8, '同一问题的两面'],
    [8, 9, '因果'],
    [9, 10, '同一线索'],
    [10, 11, '互相印证'],
    [1, 8, '概念相近'],
    [2, 9, '']
  ]
  for (const [i, j, label] of pairs) {
    if (created[i] && created[j]) {
      await store.createLink({ a: created[i], b: created[j], label })
    }
  }

  await store.saveSettings({ lastNoteId: created[0] ?? null })
}
