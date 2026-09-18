import { useEffect, useState } from 'react'
import FileList from './pages/FileList'
import Viewer3D from './pages/Viewer3D'
import ViewerVTK from './pages/ViewerVTK'
import ViewerChart from './pages/ViewerChart'
import './App.css'

interface Route {
  name: string
  page?: string
  id?: string
  kind?: string
}

function parseHash(): Route {
  const h = window.location.hash || ''
  const m = h.match(/^#\/view\/(\w+)\/([\w-]+)(?:\?kind=(\w+))?/)
  if (m) return { name: 'view', page: m[1], id: m[2], kind: m[3] }
  return { name: 'home' }
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash)

  useEffect(() => {
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const open = (id: string, page: string, kind: string) => {
    window.location.hash = `#/view/${page}/${id}?kind=${kind}`
  }

  const back = () => { window.location.hash = '#/' }

  return (
    <div className="app">
      {route.name === 'home' && <FileList onOpen={open} />}

      {route.name === 'view' && route.page === '3d' && route.id && (
        <>
          <div className="topbar">
            <button className="back-btn" onClick={back}>‹ 返回</button>
            <span>三维模型</span>
            <span />
          </div>
          <Viewer3D fileId={route.id} />
        </>
      )}

      {route.name === 'view' && route.page === 'vtk' && route.id && (
        <>
          <div className="topbar">
            <button className="back-btn" onClick={back}>‹ 返回</button>
            <span>仿真结果云图</span>
            <span />
          </div>
          <ViewerVTK fileId={route.id} kind={route.kind || 'vtu'} />
        </>
      )}

      {route.name === 'view' && route.page === 'chart' && route.id && (
        <>
          <div className="topbar">
            <button className="back-btn" onClick={back}>‹ 返回</button>
            <span>MATLAB 数据</span>
            <span />
          </div>
          <ViewerChart fileId={route.id} />
        </>
      )}
    </div>
  )
}
