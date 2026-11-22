import { useState } from 'react'
import { useVault } from '../store/vaultStore'
import { useUi } from '../store/uiStore'

export function Welcome(): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const createVault = useVault((s) => s.createVault)
  const showToast = useUi((s) => s.showToast)

  const choose = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const res = await createVault()
      if (!res.item) {
        setBusy(false)
        if (res.message) setError(res.message)
        return
      }
      showToast('星系已建好，右键空白处就能新建笔记')
    } catch (err) {
      setError(String(err))
      setBusy(false)
    }
  }

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <div className="welcome-eyebrow">GALAXY NOTES</div>
        <h1 className="welcome-title">
          每篇笔记
          <br />
          都是星图里的一颗星球
        </h1>
        <p className="welcome-lead">
          选一个文件夹作为你的第一个星系。笔记存成本地 JSON，一篇一个文件；图片放在
          <code> assets/</code>，关联放在 <code>graph.json</code>。没有账号，没有云，关掉网也能用。
        </p>
        <button className="btn primary big" onClick={() => void choose()} disabled={busy}>
          {busy ? '正在创建…' : '选择 / 新建星系目录'}
        </button>
        {error && <div className="welcome-error">{error}</div>}
        <div className="welcome-hints">
          <div>
            <b>右键空白</b> 新建笔记
          </div>
          <div>
            <b>左键点击星球</b> 进入编辑
          </div>
          <div>
            <b>点击空白 / Esc</b> 缩回星球
          </div>
          <div>
            <b>Ctrl + 左键</b> 选中两颗星球后右键可建立关联
          </div>
        </div>
      </div>
    </div>
  )
}
