import { useState } from 'react'
import type { VaultItem } from '@shared/types'
import { Modal } from './Modal'

interface DeleteVaultModalProps {
  item: VaultItem | null
  onCancel: () => void
  onConfirm: (item: VaultItem) => Promise<boolean>
}

/**
 * 删除星系前的二次确认。
 * 删的是「星系数据」（notes / assets / graph.json / vault.json）并送进回收站，
 * 文件夹里用户自己的文件不动；只有目录里只剩我们建的东西时，才整个文件夹进回收站。
 */
export function DeleteVaultModal({
  item,
  onCancel,
  onConfirm
}: DeleteVaultModalProps): JSX.Element | null {
  const [busy, setBusy] = useState(false)

  if (!item) return null

  const confirm = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    await onConfirm(item)
    setBusy(false)
  }

  return (
    <Modal width={468} onBackdrop={onCancel}>
      <div className="modal-title danger-title">删除星系「{item.name}」？</div>
      <div className="sub-note">
        这条不能撤销——不过删除的东西会进系统回收站，还能捞回来。
      </div>
      <ul className="danger-list">
        <li>
          删掉 <code>notes/</code>（{item.noteCount} 篇笔记）、<code>assets/</code>、
          <code>graph.json</code>、<code>vault.json</code>
        </li>
        <li>
          如果这个文件夹里还有你自己的文件，<b>只删星系数据，文件夹保留</b>
        </li>
        <li>文件夹里只剩星系数据时，整个文件夹一起进回收站</li>
        {item.active && <li className="warn">这是当前正在用的星系，删完会自动切到下一个（没有就回欢迎页）</li>}
      </ul>
      <div className="folder-path">{item.path}</div>
      <div className="modal-actions">
        <button className="btn ghost" onClick={onCancel} disabled={busy}>
          取消
        </button>
        <button className="btn danger" onClick={() => void confirm()} disabled={busy}>
          {busy ? '正在删除…' : '删除这个星系'}
        </button>
      </div>
    </Modal>
  )
}
