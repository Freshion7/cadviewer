import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { downloadUrl } from '../api'

interface Props {
  fileId: string
}

export default function Viewer3D({ fileId }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [wireframe, setWireframe] = useState(false)
  const [info, setInfo] = useState('')
  const stateRef = useRef<{ scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls; model?: THREE.Group } | null>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0f172a)

    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 0.01, 10000)
    camera.position.set(3, 2.2, 3)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.12

    // 灯光
    scene.add(new THREE.AmbientLight(0xffffff, 0.75))
    const dir = new THREE.DirectionalLight(0xffffff, 1.4)
    dir.position.set(5, 8, 6)
    scene.add(dir)
    const dir2 = new THREE.DirectionalLight(0x88aaff, 0.4)
    dir2.position.set(-5, -2, -4)
    scene.add(dir2)

    const grid = new THREE.GridHelper(2, 12, 0x334155, 0x1e293b)
    scene.add(grid)

    stateRef.current = { scene, camera, controls }

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

    // 加载 GLB
    const loader = new GLTFLoader()
    loader.load(
      downloadUrl(fileId, 'model'),
      (gltf) => {
        const model = gltf.scene
        // 自动居中并缩放
        const box = new THREE.Box3().setFromObject(model)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        model.position.sub(center)
        const maxDim = Math.max(size.x, size.y, size.z) || 1
        const scale = 1.6 / maxDim
        model.scale.multiplyScalar(scale)

        model.traverse(o => {
          if (o instanceof THREE.Mesh) {
            o.material = new THREE.MeshStandardMaterial({
              color: 0x6ea8fe, metalness: 0.15, roughness: 0.55,
              side: THREE.DoubleSide,
            })
          }
        })
        scene.add(model)
        stateRef.current!.model = model
        setInfo(`面数 ${gltf.parser.json.accessors ? '已加载' : ''} · 已自动居中`)
        setLoading(false)
      },
      (xhr) => setLoading(true),
      (err) => { setError('模型加载失败：' + (err as Error).message); setLoading(false) }
    )

    return () => {
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [fileId])

  const resetView = () => {
    const s = stateRef.current
    if (!s) return
    s.camera.position.set(3, 2.2, 3)
    s.controls.target.set(0, 0, 0)
    s.controls.update()
  }

  const toggleWire = () => {
    const s = stateRef.current
    if (!s?.model) return
    const next = !wireframe
    setWireframe(next)
    s.model.traverse(o => {
      if (o instanceof THREE.Mesh) {
        const mat = o.material as THREE.MeshStandardMaterial
        mat.wireframe = next
      }
    })
  }

  return (
    <div className="viewer-page">
      <div ref={mountRef} className="viewer-canvas" />
      <div className="viewer-toolbar">
        <button onClick={resetView}>重置视角</button>
        <button onClick={toggleWire} className={wireframe ? 'active' : ''}>线框</button>
        <a className="btn-download" href={downloadUrl(fileId, 'model')} download>下载GLB</a>
      </div>
      {loading && <div className="viewer-loading">正在加载模型…</div>}
      {error && <div className="viewer-error">{error}</div>}
      {info && <div className="viewer-info">{info}</div>}
    </div>
  )
}
