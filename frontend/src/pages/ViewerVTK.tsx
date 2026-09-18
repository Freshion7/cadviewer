import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { buildColors, fieldRange, parseVTU, type VTUData } from '../lib/vtu'
import { downloadUrl, getFile } from '../api'

interface Props {
  fileId: string
  kind: string   // vtu | vtp
}

export default function ViewerVTK({ fileId, kind }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const [fields, setFields] = useState<string[]>([])
  const [field, setField] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [meta, setMeta] = useState<Record<string, unknown> | null>(null)
  const [range, setRange] = useState<[number, number]>([0, 1])
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    controls: OrbitControls
    mesh: THREE.Mesh
    data: VTUData
  } | null>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0f172a)
    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 0.001, 10000)
    camera.position.set(3, 2.2, 3)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.12

    scene.add(new THREE.AmbientLight(0xffffff, 0.8))
    const dir = new THREE.DirectionalLight(0xffffff, 1.3)
    dir.position.set(5, 8, 6)
    scene.add(dir)
    const grid = new THREE.GridHelper(2, 12, 0x334155, 0x1e293b)
    scene.add(grid)

    const mesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7, metalness: 0.1 }),
    )
    scene.add(mesh)

    stateRef.current = { renderer, scene, camera, controls, mesh, data: null as unknown as VTUData }

    const onResize = () => {
      if (!mount) return
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(mount.clientWidth, mount.clientHeight)
    }
    window.addEventListener('resize', onResize)

    const animate = () => {
      requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    getFile(fileId).then(t => setMeta(t.meta))

    fetch(downloadUrl(fileId, kind))
      .then(r => r.text())
      .then(async text => {
        const data = await parseVTU(text)
        stateRef.current!.data = data

        const geo = mesh.geometry
        geo.setAttribute('position', new THREE.BufferAttribute(data.points, 3))
        geo.setIndex(new THREE.BufferAttribute(data.triangles, 1))
        geo.computeVertexNormals()

        // 自动居中缩放
        geo.computeBoundingBox()
        const box = geo.boundingBox!
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        mesh.position.copy(center).multiplyScalar(-1)
        const maxDim = Math.max(size.x, size.y, size.z) || 1
        mesh.scale.setScalar(1.6 / maxDim)
        mesh.frustumCulled = false

        if (data.fields.length > 0) {
          const names = data.fields.map(f => f.name)
          setFields(names)
          applyField(names[0], data)
        } else {
          // 无标量场：渲染纯色
          const colors = new Float32Array(data.points.length)
          mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
          setField('')
          camera.position.set(3, 2.2, 3)
          controls.update()
          setLoading(false)
        }
      })
      .catch(e => { console.error('VTK加载错误', e); setError('结果加载失败：' + e.message); setLoading(false) })

    return () => {
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId, kind])

  const applyField = (name: string, data?: VTUData) => {
    const s = stateRef.current
    if (!s) return
    const d = data || s.data
    const values = d.pointScalars[name]
    if (!values) return
    const [min, max] = fieldRange(values)
    const colors = buildColors(values, min, max)
    s.mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    setRange([min, max])
    setField(name)
    setLoading(false)
  }

  const onFieldChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    applyField(e.target.value)
  }

  const toggleWire = () => {
    const s = stateRef.current
    if (!s) return
    const mat = s.mesh.material as THREE.MeshStandardMaterial
    mat.wireframe = !mat.wireframe
  }

  return (
    <div className="viewer-page">
      <div ref={mountRef} className="viewer-canvas" />
      <div className="viewer-toolbar">
        {fields.length > 0 && (
          <select value={field} onChange={onFieldChange}>
            {fields.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        )}
        <button onClick={toggleWire}>线框</button>
        <a className="btn-download" href={downloadUrl(fileId, kind)} download>下载结果</a>
      </div>

      {/* 标量条 */}
      {fields.length > 0 && (
        <div className="scalar-bar" ref={barRef}>
          <div className="scalar-gradient" />
          <div className="scalar-max">{range[1].toExponential(3)}</div>
          <div className="scalar-min">{range[0].toExponential(3)}</div>
        </div>
      )}

      {loading && <div className="viewer-loading">正在加载结果…</div>}
      {error && <div className="viewer-error">{error}</div>}
      {meta && (
        <div className="viewer-info">
          {String(meta.nodes ?? '-')} 节点 / {String(meta.elements ?? '-')} 单元
          {Array.isArray(meta.result_titles) && (meta.result_titles as string[]).length > 0 &&
            ` · ${(meta.result_titles as string[]).join('、')}`}
        </div>
      )}
    </div>
  )
}
