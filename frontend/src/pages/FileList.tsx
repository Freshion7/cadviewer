import { useCallback, useEffect, useRef, useState } from 'react'
import { FileTask, kindLabel, listFiles, uploadFile, viewerFor } from '../api'

const ACCEPT = '.stl,.obj,.ply,.off,.gltf,.glb,.3mf,.step,.stp,.igs,.iges,.brep,.rst,.rth,.rmg,.rfl,.cdb,.vtu,.vtp,.mat,.CATPart,.CATProduct,.CATShape,.sldprt,.sldasm,.fig'

const ICONS: Record<string, string> = {
  mesh: '📦', step: '🧊', ansys: '🔧', vtu: '🔧', vtp: '🔧',
  matlab: '📈', native: '🗂️', unsupported: '⚠️', unknown: '📄',
}

function fmtSize(n: number) {
  if (!n) return '-'
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1024 / 1024).toFixed(1) + ' MB'
}

export default function FileList({ onOpen }: { onOpen: (id: string, page: string, kind: string) => void }) {
  const [files, setFiles] = useState<FileTask[]>([])
  const [uploading, setUploading] = useState(false)
  const [tip, setTip] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    try {
      setFiles(await listFiles())
    } catch { /* 后端未就绪时静默 */ }
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 2500)
    return () => clearInterval(t)
  }, [refresh])

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setUploading(true)
    setTip('上传中：' + f.name)
    try {
      const task = await uploadFile(f)
      setTip(`已上传 ${task.filename}，正在后台转换…`)
      refresh()
    } catch (err) {
      setTip('上传失败：' + (err as Error).message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const open = (t: FileTask) => {
    const v = viewerFor(t)
    if (v) onOpen(t.id, v.page, v.kind)
  }

  return (
    <div className="file-page">
      <div className="hero">
        <h1>掌上工程查看器</h1>
        <p>CATIA / SolidWorks / ANSYS / MATLAB 文件 · 手机随时看</p>
      </div>

      <div className="upload-zone" onClick={() => fileRef.current?.click()}>
        <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={onPick} />
        <div className="upload-plus">{uploading ? '…' : '+'}</div>
        <div>{uploading ? '正在上传' : '点击上传工程文件'}</div>
        <div className="upload-hint">支持 STL/OBJ/STEP/IGS/GLB、ANSYS .rst、MATLAB .mat 等</div>
      </div>

      {tip && <div className="tip">{tip}</div>}

      {files.length === 0 && !tip && (
        <div className="empty">还没有文件，点击上方区域上传第一个工程文件</div>
      )}

      <div className="file-list">
        {files.map(t => {
          const v = viewerFor(t)
          return (
            <div key={t.id} className={`file-card status-${t.status}`} onClick={() => v && open(t)}>
              <div className="file-icon">{ICONS[t.kind] || '📄'}</div>
              <div className="file-body">
                <div className="file-name">{t.filename}</div>
                <div className="file-sub">
                  {kindLabel(t.kind)} · {fmtSize(t.size)} · {t.created_at}
                </div>
                <div className="file-msg" title={t.message}>{t.message}</div>
              </div>
              <div className="file-status">
                {t.status === 'done' && v && <span className="btn-view">查看 ▶</span>}
                {t.status === 'done' && !v && <span className="badge done">完成</span>}
                {t.status === 'converting' && <span className="badge converting">转换中</span>}
                {t.status === 'pending' && <span className="badge pending">排队</span>}
                {t.status === 'error' && <span className="badge error">失败</span>}
              </div>
            </div>
          )
        })}
      </div>

      <div className="foot-note">
        原生 CATIA / SolidWorks 需先在装有对应软件的电脑上转成 STEP（见 tools 目录脚本）。
      </div>
    </div>
  )
}
