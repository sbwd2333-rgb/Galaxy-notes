import { app } from 'electron'
import * as path from 'node:path'

/**
 * 星系库路径护栏。
 *
 * 目标：不允许把「桌面 / 图片 / 下载 / 文档」这类一级目录、磁盘根、系统目录当库，
 * 免得清理星系时误伤其它文件。用户想放桌面可以，但必须是桌面下的一个专门子文件夹。
 */

export interface PathCheck {
  ok: boolean
  message?: string
}

/** 主目录下这些「系统级」一级目录不能当库（里面通常有大量别的文件） */
const HOME_SPECIAL_NAMES = new Set([
  'desktop',
  'documents',
  'downloads',
  'pictures',
  'music',
  'videos',
  'onedrive',
  'favorites',
  'links',
  'contacts',
  'searches',
  'saved games',
  '3d objects'
])

function sameOrInside(child: string, parent: string): boolean {
  return child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep)
}

function appPathSafe(key: 'desktop' | 'documents' | 'downloads' | 'pictures' | 'music' | 'videos'): string {
  try {
    return app.getPath(key).toLowerCase()
  } catch {
    return ''
  }
}

export function checkVaultPath(candidate: string): PathCheck {
  if (!candidate || !path.isAbsolute(candidate)) {
    return { ok: false, message: '请选择一个文件夹。' }
  }

  const abs = path.resolve(candidate)
  const root = path.parse(abs).root
  const lower = abs.toLowerCase()

  // 1. 磁盘根
  if (path.normalize(abs).toLowerCase() === path.normalize(root).toLowerCase()) {
    return {
      ok: false,
      message: '不能把整个磁盘当成星系库。请在里面新建一个专门放笔记的文件夹。'
    }
  }

  const home = app.getPath('home')
  const homeLower = home.toLowerCase()

  // 2. 用户主目录本身
  if (lower === homeLower) {
    return {
      ok: false,
      message: '不能把用户主目录当成星系库。请在里面新建一个专门放笔记的文件夹。'
    }
  }

  // 3. 主目录下「系统级」的一级目录：桌面 / 文档 / 下载 / 图片 / 音乐 / 视频 / OneDrive …
  //    （用户自己在主目录下新建的文件夹不拦，那是专门给笔记用的）
  const relToHome = path.relative(home, abs)
  const inHome = !!relToHome && !relToHome.startsWith('..') && !path.isAbsolute(relToHome)
  const segs = inHome ? relToHome.split(path.sep).filter(Boolean) : []
  if (segs.length === 1) {
    const firstLower = segs[0].toLowerCase()
    const specialPaths = [
      appPathSafe('desktop'),
      appPathSafe('documents'),
      appPathSafe('downloads'),
      appPathSafe('pictures'),
      appPathSafe('music'),
      appPathSafe('videos')
    ].filter(Boolean)
    const isSpecial = HOME_SPECIAL_NAMES.has(firstLower) || specialPaths.some((s) => sameOrInside(lower, s))
    if (isSpecial) {
      const name = path.basename(abs)
      return {
        ok: false,
        message: `「${name}」是系统的一级文件夹（桌面/文档/图片这类），里面通常还有别的东西，不适合当星系库。请在它里面新建一个子文件夹（比如 ${path.join(name, '星系笔记')}）再选。`
      }
    }
  }

  // 4. Windows / Program Files / ProgramData
  const sysRoots = [
    process.env.SystemRoot,
    process.env.windir,
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.ProgramData
  ]
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .map((p) => path.resolve(p).toLowerCase())
  for (const s of sysRoots) {
    if (sameOrInside(lower, s)) {
      return { ok: false, message: '系统目录不能作为星系库，请换一个位置。' }
    }
  }

  // 5. AppData（应用自己的数据都放这，别和笔记混）
  const appData = app.getPath('appData').toLowerCase()
  if (sameOrInside(lower, appData)) {
    return { ok: false, message: '应用数据目录不能作为星系库，请换一个位置。' }
  }

  return { ok: true }
}
