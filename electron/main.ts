import { app, BrowserWindow, Menu, ipcMain, protocol } from 'electron'
import * as path from 'node:path'
import { promises as fs } from 'node:fs'
import { shell } from 'electron'
import { VaultStore } from './ipc/store'
import { getVault, setMainWindow, setVault, getMainWindow } from './ipc/context'
import { registerVaultIpc } from './ipc/vault'
import { registerNotesIpc } from './ipc/notes'
import { registerLinksIpc } from './ipc/links'
import { registerAssetsIpc } from './ipc/assets'
import { registerMenuIpc } from './ipc/menu'
import { readLastVault, writeLastVault } from './ipc/pointer'
import { runSelfTest } from './selftest'
import { seedSmokeVault } from './smoke'

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp'
}

// 必须在 app ready 之前注册（规格书 §4）
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'asset',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

function registerAssetProtocol(): void {
  protocol.handle('asset', async (request) => {
    let root: string
    try {
      root = getVault().root
    } catch {
      return new Response('no vault', { status: 404 })
    }
    let rel: string
    try {
      const url = new URL(request.url)
      rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    } catch {
      return new Response('bad url', { status: 400 })
    }
    // relPath 存的是「assets/<gid>/<file>」，已经带 assets 段，直接相对库根解析
    const assetsRoot = path.join(root, 'assets')
    const abs = path.resolve(root, rel)
    // 目录穿越防护
    if (!abs.startsWith(assetsRoot + path.sep)) {
      return new Response('forbidden', { status: 403 })
    }
    try {
      const buf = await fs.readFile(abs)
      const ext = path.extname(abs).slice(1).toLowerCase()
      return new Response(new Uint8Array(buf), {
        status: 200,
        headers: {
          'content-type': MIME[ext] ?? 'application/octet-stream',
          'cache-control': 'no-cache'
        }
      })
    } catch {
      return new Response('not found', { status: 404 })
    }
  })
}

function registerIpc(): void {
  registerVaultIpc()
  registerNotesIpc()
  registerLinksIpc()
  registerAssetsIpc()
  registerMenuIpc()

  ipcMain.on('app:set-title', (e, title: string) => {
    BrowserWindow.fromWebContents(e.sender)?.setTitle(title)
  })
  ipcMain.on('app:notify', (_e, level: 'info' | 'error', message: string) => {
    // 主进程侧只落日志；UI 提示由渲染进程自己 Toast
    if (level === 'error') console.error('[renderer]', message)
    else console.log('[renderer]', message)
  })
  ipcMain.on('app:flushed', async () => {
    const win = getMainWindow()
    if (!win) return
    closing = true
    try {
      await persistWindowState(win)
    } catch {
      /* ignore */
    }
    win.close()
  })
}

let closing = false

async function persistWindowState(win: BrowserWindow): Promise<void> {
  try {
    const store = getVault()
    const bounds = win.getBounds()
    await store.saveSettings({
      window: {
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        maximized: win.isMaximized()
      }
    })
  } catch {
    /* 没库就不写 */
  }
}

async function attachVaultFromLastPath(): Promise<void> {
  const lastPath = await readLastVault()
  if (!lastPath) return
  const store = new VaultStore(lastPath, { trash: (p) => shell.trashItem(p) })
  try {
    await store.ensureLayout()
    setVault(store)
    await writeLastVault(store.root)
  } catch (err) {
    console.error('[vault] 无法打开上次的库', err)
  }
}

async function createWindow(): Promise<BrowserWindow> {
  let bounds = { width: 1440, height: 900, x: undefined as number | undefined, y: undefined as number | undefined, maximized: false }
  try {
    const settings = await getVault().readSettings()
    if (settings.window) {
      bounds = {
        width: Math.max(1024, settings.window.width || 1440),
        height: Math.max(640, settings.window.height || 900),
        x: settings.window.x,
        y: settings.window.y,
        maximized: !!settings.window.maximized
      }
    }
  } catch {
    /* 首次启动，用默认尺寸 */
  }

  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#05060a',
    title: 'Galaxy Notes · 思维奇点',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  })

  setMainWindow(win)

  win.once('ready-to-show', () => {
    if (bounds.maximized) win.maximize()
    win.show()
  })

  // 不允许应用内导航、不允许开新窗口
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  win.on('close', async (e) => {
    if (closing) {
      await persistWindowState(win)
      return
    }
    e.preventDefault()
    // 让渲染进程把未保存的内容 flush 掉，1.6s 兜底强关
    win.webContents.send('app:flush')
    setTimeout(() => {
      if (!closing) {
        closing = true
        void persistWindowState(win).finally(() => win.destroy())
      }
    }, 1600)
  })

  win.on('closed', () => setMainWindow(null))

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    await win.loadURL(devUrl)
  } else {
    await win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  return win
}

async function bootstrap(): Promise<void> {
  app.setAppUserModelId('com.galaxynotes.app')
  Menu.setApplicationMenu(null)
  registerAssetProtocol()
  registerIpc()
  await attachVaultFromLastPath()

  if (process.argv.includes('--smoke')) {
    const argIdx = process.argv.indexOf('--smoke-vault')
    if (argIdx > -1 && process.argv[argIdx + 1]) {
      const vaultPath = process.argv[argIdx + 1]
      // 自检库每次重建，保证截图可复现
      await fs.rm(vaultPath, { recursive: true, force: true })
      const store = new VaultStore(vaultPath, { trash: (p) => shell.trashItem(p) })
      await store.init()
      await seedSmokeVault(store)
      setVault(store)
      await writeLastVault(store.root)
    }
  }

  const win = await createWindow()

  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (process.argv.includes('--smoke') || process.env['GALAXY_VERBOSE']) {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`)
    }
  })

  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[renderer gone]', details)
  })

  if (process.argv.includes('--smoke')) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const img = await win.webContents.capturePage()
          const out = path.join(process.cwd(), 'smoke.png')
          await fs.writeFile(out, img.toPNG())
          console.log(`[smoke] screenshot -> ${out}`)
        } catch (err) {
          console.error('[smoke] capture failed', err)
        }
        app.exit(0)
      }, 9000)
    })
  }
}

// ---------- 生命周期 ----------

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = getMainWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  if (process.argv.includes('--selftest')) {
    void runSelfTest()
      .then(async (result) => {
        try {
          await fs.writeFile(
            path.join(process.cwd(), 'selftest-result.json'),
            JSON.stringify(result, null, 2),
            'utf8'
          )
        } catch {
          /* ignore */
        }
        process.stdout.write('SELFTEST_RESULT ' + JSON.stringify(result) + '\n')
        setTimeout(() => app.exit(result.fail.length === 0 ? 0 : 1), 150)
      })
      .catch((err) => {
        process.stdout.write('SELFTEST_RESULT ' + JSON.stringify({ fail: [String(err)], pass: [] }) + '\n')
        setTimeout(() => app.exit(1), 150)
      })
  } else {
    app.whenReady().then(bootstrap)
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit()
    })
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow()
    })
  }
}
