/**
 * 生成一个示例星系（给 demo 用）：10 篇笔记 + 8 条关联。
 * 内容是中性的通用文字，不含任何真实用户数据。
 *
 * 用法：node scripts/make-demo-vault.mjs <输出目录>
 */
import { promises as fs } from 'node:fs'
import * as path from 'node:path'

const out = process.argv[2] ?? 'demo-vault'
const root = path.resolve(out)

const PALETTE = ['#6ea8ff', '#7ee0b8', '#f5b971', '#e07a9b', '#b58cff', '#5fd0e0']

const NOTES = [
  {
    title: '欢迎来到思维奇点',
    body: [
      '每一篇笔记，都是这片星系里的一颗星球。',
      '左键点进去就能写字，点一下空白处或者按 Esc，星球会缩回原来的位置。',
      '想连起来两篇：按住 Ctrl 左键选中两颗星球，右键选「建立关联」。'
    ]
  },
  {
    title: '笔记应该长什么样',
    body: [
      '不要一上来就分类、建文件夹、设计标签体系。',
      '先写，写到某个数量之后，结构会自己长出来——就像星系是力导向自己排的，不是你摆的。'
    ]
  },
  {
    title: '关于注意力的观察',
    body: [
      '过去半年我记录了自己每天第一次打开手机的时间。',
      '平均值是起床后 6 分钟，最早的一次是 40 秒。',
      '把这个数字写下来之后，行为本身并没有立刻改变，但「知道」这件事开始起作用了。'
    ]
  },
  {
    title: '为什么我记不住上周二',
    body: [
      '记忆不是录像，是每次回忆时重建的一次。',
      '所以反复回忆同一件事，其实是在反复修改它。',
      '这也是为什么写下来比记住重要：文字不会因为你今天心情不好就变个样子。'
    ]
  },
  {
    title: '写作是最慢的思考',
    body: [
      '说话可以含糊，写作不行——你打出来的每个词都得具体。',
      '所以卡住的时候，往往不是没想法，而是想法还没细到能被写下来的程度。'
    ]
  },
  {
    title: '一个关于颜色的实验',
    body: [
      '同样的红色，放在不同底色上，看起来完全不同。',
      '上下文改变的不是物体，是你对它的判断。'
    ]
  },
  {
    title: '无向关系与知识网络',
    body: [
      '大部分笔记软件把链接做成有方向的：A 指向 B。',
      '但知识之间的关系往往没有方向——它们只是「有关」。',
      '把这层方向去掉，关系网会更容易长出来，因为你不用每次都想清楚谁在前。'
    ]
  },
  {
    title: '分布式系统里的权衡',
    body: [
      '一致性、可用性、分区容忍，三者只能弱化一个。',
      '这不是技术问题，是你在告诉用户「出错的时候你更愿意看到什么」。'
    ]
  },
  {
    title: '产品直觉从哪里来',
    body: [
      '来自大量「用过之后觉得别扭」的具体记忆。',
      '还没有直觉的时候，不要靠推理硬凹，去用更多东西。'
    ]
  },
  {
    title: '深夜写下的失败复盘',
    body: [
      '项目失败不是因为方向错，是因为三个月里没有一次真正的用户反馈。',
      '所有「等做完再给人看」的计划，最后都变成了做完之后不好意思给人看。'
    ]
  }
]

const LINKS = [
  [0, 1, '互为前提'],
  [1, 2, '同一问题的两面'],
  [2, 3, '同一线索'],
  [4, 5, '互相印证'],
  [4, 6, '概念相近'],
  [5, 6, '对照实验'],
  [7, 8, '案例与理论'],
  [8, 9, '同一线索'],
  [6, 9, '互为前提']
]

function gid(i) {
  return `demo${String(i).padStart(6, '0')}`
}

function para(text) {
  return { type: 'paragraph', content: [{ type: 'text', text }] }
}

function iso(minutesAgo) {
  const d = new Date(Date.now() - minutesAgo * 60000)
  const pad = (n) => String(n).padStart(2, '0')
  const tz = -d.getTimezoneOffset()
  const sign = tz >= 0 ? '+' : '-'
  const abs = Math.abs(tz)
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `.${String(d.getMilliseconds()).padStart(3, '0')}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  )
}

await fs.rm(root, { recursive: true, force: true })
await fs.mkdir(path.join(root, 'notes'), { recursive: true })
await fs.mkdir(path.join(root, 'assets'), { recursive: true })

const n = NOTES.length
for (let i = 0; i < n; i++) {
  const note = NOTES[i]
  const y = 1 - (i / (n - 1)) * 2
  const r = Math.sqrt(Math.max(0, 1 - y * y))
  const theta = i * 2.399963
  const pos = [Math.cos(theta) * r * 54, y * 46, Math.sin(theta) * r * 54]
  const created = iso(240 + i * 30)
  const doc = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: note.title }] },
      ...note.body.map(para)
    ]
  }
  const text = [note.title, ...note.body].join('\n\n')
  await fs.writeFile(
    path.join(root, 'notes', `${gid(i)}.json`),
    JSON.stringify(
      {
        gid: gid(i),
        title: note.title,
        created,
        updated: created,
        color: PALETTE[i % PALETTE.length],
        pos,
        scale: i === 0 ? 1.6 : 1,
        doc,
        text
      },
      null,
      2
    ),
    'utf8'
  )
}

await fs.writeFile(
  path.join(root, 'graph.json'),
  JSON.stringify(
    {
      version: 1,
      links: LINKS.map(([a, b, label], k) => {
        const [x, y] = a < b ? [a, b] : [b, a]
        return {
          id: `l_demo${String(k).padStart(4, '0')}`,
          a: gid(x),
          b: gid(y),
          label,
          origin: 'manual',
          created: iso(200),
          aiRationale: null
        }
      })
    },
    null,
    2
  ),
  'utf8'
)

await fs.writeFile(
  path.join(root, 'vault.json'),
  JSON.stringify(
    {
      version: 1,
      vaultPath: root,
      lastNoteId: null,
      camera: { position: [32, 26, 96], target: [0, 0, 0] },
      window: { width: 1440, height: 900, maximized: false }
    },
    null,
    2
  ),
  'utf8'
)

const files = await fs.readdir(path.join(root, 'notes'))
console.log(JSON.stringify({ root, notes: files.length, links: LINKS.length }))
