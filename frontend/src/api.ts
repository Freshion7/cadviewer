export interface Product {
  kind: string
  path: string
  filename: string
}

export interface FileTask {
  id: string
  filename: string
  size: number
  kind: string
  status: 'pending' | 'converting' | 'done' | 'error'
  message: string
  created_at: string
  products: Product[]
  meta: Record<string, unknown> | null
}

const BASE = ''

export async function listFiles(): Promise<FileTask[]> {
  const r = await fetch(`${BASE}/api/files`)
  const j = await r.json()
  return j.files
}

export async function getFile(id: string): Promise<FileTask> {
  const r = await fetch(`${BASE}/api/files/${id}`)
  return r.json()
}

export async function uploadFile(file: File): Promise<FileTask> {
  const fd = new FormData()
  fd.append('file', file)
  const r = await fetch(`${BASE}/api/files`, { method: 'POST', body: fd })
  if (!r.ok) throw new Error((await r.json()).detail || '上传失败')
  return r.json()
}

export function downloadUrl(id: string, kind: string): string {
  return `${BASE}/api/files/${id}/download?kind=${kind}`
}

export function kindLabel(kind: string): string {
  const map: Record<string, string> = {
    mesh: '3D网格', step: 'CAD几何', ansys: 'ANSYS结果', vtu: 'VTK网格',
    vtp: 'VTK网格', matlab: 'MATLAB数据', native: '原生CAD', unsupported: '暂不支持',
    unknown: '未知',
  }
  return map[kind] || kind
}

export function viewerFor(task: FileTask): { page: string; kind: string } | null {
  if (task.status !== 'done') return null
  const kinds = task.products.map(p => p.kind)
  if (kinds.includes('model')) return { page: '3d', kind: 'model' }
  if (kinds.includes('vtu')) return { page: 'vtk', kind: 'vtu' }
  if (kinds.includes('vtp')) return { page: 'vtk', kind: 'vtp' }
  if (kinds.includes('data') || kinds.includes('chart')) return { page: 'chart', kind: 'data' }
  return null
}
