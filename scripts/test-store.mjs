/**
 * 纯 node 跑数据层自测（不需要 Electron 窗口）。
 * 用 tsc 把 selftest 入口编译成 cjs 再执行。
 * 用法：node scripts/test-store.mjs
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import * as path from 'node:path'

const cwd = process.cwd()
const outDir = path.join(cwd, 'scripts', '.tmp')
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const tsc = path.join(cwd, 'node_modules', 'typescript', 'bin', 'tsc')
const args = [
  tsc,
  path.join(cwd, 'scripts', 'selftest-entry.ts'),
  '--outDir',
  outDir,
  '--rootDir',
  cwd,
  '--module',
  'commonjs',
  '--target',
  'ES2022',
  '--moduleResolution',
  'node',
  '--esModuleInterop',
  '--skipLibCheck',
  '--types',
  'node',
  '--noEmitOnError',
  'false'
]

const comp = spawnSync(process.execPath, args, { stdio: 'inherit' })
if (comp.status !== 0) process.exit(comp.status ?? 1)

const entry = path.join(outDir, 'scripts', 'selftest-entry.js')
const run = spawnSync(process.execPath, [entry], { stdio: 'inherit' })
process.exit(run.status ?? 1)
