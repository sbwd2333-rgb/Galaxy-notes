import { app, ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import type { Todo } from '../../shared/types'
import { genId, nowIso } from './store'

/**
 * 右下角书签里的待办清单。
 *
 * 存在 userData/todos.json —— 和笔记库分开：待办是「今天要做的事」，
 * 不该跟着星系切换而消失。切换星系、换库都不影响它。
 */

interface TodosFile {
  version: 1
  items: Todo[]
}

function todosPath(): string {
  return path.join(app.getPath('userData'), 'todos.json')
}

async function readTodos(): Promise<Todo[]> {
  try {
    const raw = await fs.readFile(todosPath(), 'utf8')
    const parsed = JSON.parse(raw) as TodosFile
    if (!parsed || !Array.isArray(parsed.items)) return []
    return parsed.items
      .filter((t) => t && typeof t.id === 'string' && typeof t.text === 'string')
      .map((t) => ({
        id: t.id,
        text: t.text,
        done: !!t.done,
        createdAt: typeof t.createdAt === 'string' ? t.createdAt : nowIso(),
        doneAt: typeof t.doneAt === 'string' ? t.doneAt : null
      }))
  } catch {
    return []
  }
}

async function writeTodos(items: Todo[]): Promise<void> {
  const abs = todosPath()
  await fs.mkdir(path.dirname(abs), { recursive: true })
  const tmp = `${abs}.tmp-${Date.now()}`
  await fs.writeFile(tmp, JSON.stringify({ version: 1, items } satisfies TodosFile, null, 2), 'utf8')
  await fs.rename(tmp, abs)
}

export function registerTodosIpc(): void {
  ipcMain.handle('todos:list', async (): Promise<Todo[]> => {
    return readTodos()
  })

  ipcMain.handle('todos:add', async (_e, text: string): Promise<Todo> => {
    const trimmed = String(text ?? '').trim().slice(0, 200)
    if (!trimmed) throw new Error('EMPTY_TODO')
    const items = await readTodos()
    const todo: Todo = {
      id: `t_${genId(8)}`,
      text: trimmed,
      done: false,
      createdAt: nowIso(),
      doneAt: null
    }
    items.push(todo)
    await writeTodos(items)
    return todo
  })

  ipcMain.handle('todos:toggle', async (_e, id: string): Promise<Todo | null> => {
    const items = await readTodos()
    const target = items.find((t) => t.id === id)
    if (!target) return null
    target.done = !target.done
    target.doneAt = target.done ? nowIso() : null
    await writeTodos(items)
    return target
  })

  ipcMain.handle('todos:remove', async (_e, id: string): Promise<Todo[]> => {
    const items = (await readTodos()).filter((t) => t.id !== id)
    await writeTodos(items)
    return items
  })

  ipcMain.handle('todos:clear-done', async (): Promise<Todo[]> => {
    const items = (await readTodos()).filter((t) => !t.done)
    await writeTodos(items)
    return items
  })
}
