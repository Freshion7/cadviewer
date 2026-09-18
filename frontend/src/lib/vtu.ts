/**
 * 轻量 VTU/VTP 解析器：支持 ascii / inline-binary(zlib) / appended 三种数据格式，
 * 覆盖 UnstructuredGrid 与 PolyData。
 * 输出三角网格 + 标量场（单元场自动插值到点），供 three.js 渲染云图。
 */

export interface FieldInfo {
  name: string
  components: number
}

export interface VTUData {
  points: Float32Array                 // N*3
  triangles: Uint32Array               // 三角索引
  fields: FieldInfo[]                  // 可用场
  pointScalars: Record<string, Float32Array>  // 每场每点的标量值
}

const VTK_TRIANGLE = 5
const VTK_QUAD = 9
const VTK_TETRA = 10
const VTK_HEXAHEDRON = 12
const VTK_WEDGE = 13
const VTK_PYRAMID = 14

// 各单元类型 -> 三角面（逆时针朝外）
const CELL_FACES: Record<number, number[][]> = {
  [VTK_TRIANGLE]: [[0, 1, 2]],
  [VTK_QUAD]: [[0, 1, 2], [0, 2, 3]],
  [VTK_TETRA]: [[0, 2, 1], [0, 1, 3], [1, 2, 3], [2, 0, 3]],
  [VTK_HEXAHEDRON]: [
    [0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6],
    [0, 4, 5], [0, 5, 1], [1, 5, 6], [1, 6, 2],
    [2, 6, 7], [2, 7, 3], [3, 7, 4], [3, 4, 0],
  ],
  [VTK_WEDGE]: [
    [0, 2, 1], [3, 4, 5], [0, 1, 4], [0, 4, 3],
    [1, 2, 5], [1, 5, 4], [2, 0, 3], [2, 3, 5],
  ],
  [VTK_PYRAMID]: [
    [0, 3, 2], [0, 2, 1], [0, 1, 4], [1, 2, 4],
    [2, 3, 4], [3, 0, 4],
  ],
}

function decodeBase64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** VTK 会在二进制块边界插入 padding(=)，使整串 base64 非法。
 *  按连续等号段分段解码再拼接，兼容连续块流。 */
function decodeVTKBase64(s: string): Uint8Array {
  const cleaned = s.replace(/\s+/g, '')
  const segs: Uint8Array[] = []
  let cur = ''
  let i = 0
  while (i < cleaned.length) {
    const ch = cleaned[i]
    if (ch === '=') {
      // 吸收连续等号（padding 成对出现），连同前缀一起解码
      let j = i
      while (j < cleaned.length && cleaned[j] === '=') j++
      segs.push(decodeBase64ToBytes(cur + cleaned.slice(i, j)))
      cur = ''
      i = j
    } else {
      cur += ch
      i++
    }
  }
  if (cur) segs.push(decodeBase64ToBytes(cur))
  const total = segs.reduce((n, a) => n + a.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const a of segs) { out.set(a, o); o += a.length }
  return out
}

async function inflateZlib(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const ds = new DecompressionStream('deflate')
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(ds)
    const buf = await new Response(stream).arrayBuffer()
    return new Uint8Array(buf)
  } catch {
    return null
  }
}

function readTyped(bytes: Uint8Array, type: string): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const little = true
  const out: number[] = []
  const elem = { 'Float64': 8, 'Float32': 4, 'Int64': 8, 'Int32': 4, 'UInt32': 4, 'Int16': 2, 'UInt16': 2, 'UInt8': 1 }[type] || 1
  const n = Math.floor(bytes.byteLength / elem)
  switch (type) {
    case 'Float64': for (let i = 0; i < n; i++) out.push(view.getFloat64(i * 8, little)); break
    case 'Float32': for (let i = 0; i < n; i++) out.push(view.getFloat32(i * 4, little)); break
    case 'Int64': { const a = new BigInt64Array(bytes.buffer, bytes.byteOffset, n); for (const v of a) out.push(Number(v)); break }
    case 'Int32': { const a = new Int32Array(bytes.buffer, bytes.byteOffset, n); for (const v of a) out.push(v); break }
    case 'UInt32': { const a = new Uint32Array(bytes.buffer, bytes.byteOffset, n); for (const v of a) out.push(v); break }
    case 'Int16': { const a = new Int16Array(bytes.buffer, bytes.byteOffset, n); for (const v of a) out.push(v); break }
    case 'UInt16': { const a = new Uint16Array(bytes.buffer, bytes.byteOffset, n); for (const v of a) out.push(v); break }
    case 'UInt8': { const a = new Uint8Array(bytes.buffer, bytes.byteOffset, n); for (const v of a) out.push(v); break }
    default: throw new Error('不支持的 VTK 数据类型: ' + type)
  }
  return out
}

/** 解析一个 DataArray 的原始字节（含解压与二进制块切分）。 */
async function resolveArrayBytes(
  el: Element,
  blobBytes: Uint8Array | null,
  headerType: string,
): Promise<Uint8Array> {
  const format = el.getAttribute('format') || 'ascii'

  if (format === 'appended' && blobBytes) {
    const offset = parseInt(el.getAttribute('offset') || '0', 10)
    const view = new DataView(blobBytes.buffer, blobBytes.byteOffset, blobBytes.byteLength)
    let blockSize: number
    if (headerType === 'UInt64') {
      const lo = view.getUint32(offset, true)
      const hi = view.getUint32(offset + 4, true)
      blockSize = hi * 2 ** 32 + lo
    } else {
      blockSize = view.getUint32(offset, true)
    }
    const hs = headerType === 'UInt64' ? 8 : 4
    const payload = blobBytes.slice(offset + hs, offset + hs + blockSize)
    const inflated = await inflateZlib(payload)
    return inflated || payload
  }

  if (format === 'binary') {
    // 取第一个文本节点（base64 数据），排除 InformationKey 等子元素
    const textNodes = Array.from(el.childNodes)
      .filter(n => n.nodeType === Node.TEXT_NODE)
      .map(n => n.textContent || '')
      .join('')
    const bytes = decodeVTKBase64(textNodes)
    if (bytes.byteLength <= 4) return bytes

    // 自适应头部：不同写入器头部长度不同（VTK9 常见 16 字节，老版本 4/8 字节）
    // 常见布局：[u32 解压大小][u32 压缩大小][zlib数据]
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const inflateAt = async (off: number) => {
      if (bytes.byteLength <= off) return null
      const compSize = view.getUint32(off - 4, true)
      const decompSize = off >= 8 ? view.getUint32(off - 8, true) : 0
      const inflated = await inflateZlib(bytes.slice(off))
      if (inflated && (inflated.byteLength === decompSize || inflated.byteLength === compSize || decompSize === 0)) {
        return inflated
      }
      return null
    }
    for (const off of [8, 16, 4, 12]) {
      const r = await inflateAt(off)
      if (r) return r
    }
    // 未压缩：头部为长度字段
    for (const hs of [4, 8]) {
      if (bytes.byteLength > hs) {
        const size = hs === 8 ? (view.getUint32(4, true) * 2 ** 32 + view.getUint32(0, true))
          : view.getUint32(0, true)
        const payload = bytes.slice(hs)
        if (payload.byteLength === size) return payload
      }
    }
    return bytes.slice(16)  // 兜底：跳过已知 16 字节头
  }

  // ascii：调用方按 ascii 处理
  return new TextEncoder().encode(el.textContent || '')
}

/** 解析 VTU/VTP 文本。 */
export async function parseVTU(text: string): Promise<VTUData> {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  const root = doc.documentElement
  if (!root || root.tagName !== 'VTKFile') throw new Error('不是有效的 VTK 文件')
  const headerType = root.getAttribute('header_type') || 'UInt64'

  // AppendedData 二进制区
  let blobBytes: Uint8Array | null = null
  const appended = root.querySelector('AppendedData')
  if (appended) {
    const enc = appended.getAttribute('encoding') || 'base64'
    if (enc !== 'base64') throw new Error('不支持的 AppendedData 编码: ' + enc)
    blobBytes = decodeVTKBase64((appended.textContent || '').replace(/^[\s_]+/, ''))
  }

  // 收集全部 DataArray（按元素定位）
  const arrayOf = new Map<Element, { values: number[]; nc: number; type: string }>()
  const els = Array.from(root.querySelectorAll('DataArray'))
  for (const el of els) {
    const type = el.getAttribute('type') || 'Float32'
    const nc = parseInt(el.getAttribute('NumberOfComponents') || '1', 10)
    const format = el.getAttribute('format') || 'ascii'
    let values: number[]
    if (format === 'ascii') {
      values = Array.from(el.textContent?.trim().split(/\s+/) || [], s => parseFloat(s))
    } else {
      const bytes = await resolveArrayBytes(el, blobBytes, headerType)
      values = readTyped(bytes, type)
    }
    arrayOf.set(el, { values, nc, type })
  }

  // ---------- 点 ----------
  const pointsEl = root.querySelector('Points > DataArray')
  if (!pointsEl) throw new Error('缺少 Points 数据')
  const pointArr = arrayOf.get(pointsEl)
  if (!pointArr) throw new Error('Points 数据解析失败')
  const rawPoints = pointArr.values
  const nPoints = rawPoints.length / (pointArr.nc || 3)
  const points = new Float32Array(rawPoints)

  // ---------- 单元 ----------
  const connEl = root.querySelector('Cells > DataArray[Name="connectivity"], Polys > DataArray[Name="connectivity"]')
  const offEl = root.querySelector('Cells > DataArray[Name="offsets"], Polys > DataArray[Name="offsets"]')
  const typeEl = root.querySelector('Cells > DataArray[Name="types"]')
  const connectivity = connEl ? arrayOf.get(connEl)!.values : []
  const offsets = offEl ? arrayOf.get(offEl)!.values : []
  const types = typeEl ? arrayOf.get(typeEl)!.values : []

  const triangles: number[] = []
  const cellOfVertex: number[][] = Array.from({ length: nPoints }, () => [])

  if (offsets.length > 0) {
    let start = 0
    for (let c = 0; c < offsets.length; c++) {
      const end = offsets[c]
      const cellVerts = connectivity.slice(start, end)
      const n = cellVerts.length
      let t = types[c]
      if (t === undefined) t = n === 3 ? VTK_TRIANGLE : n === 4 ? VTK_QUAD : t // VTP Polys 按点数推断
      const faces = CELL_FACES[t]
      if (faces) {
        for (const f of faces) {
          for (const vi of f) {
            const v = cellVerts[vi]
            if (v < nPoints) {
              triangles.push(v)
              cellOfVertex[v].push(c)
            }
          }
        }
      }
      start = end
    }
  } else if (connectivity.length >= 3) {
    for (const v of connectivity) {
      if (v < nPoints) triangles.push(v)
    }
  }

  if (triangles.length === 0) {
    throw new Error('未找到可渲染的网格单元（仅支持三角/四边/四面体/六面体等）')
  }

  // ---------- 标量场 ----------
  interface Field { name: string; values: number[]; cell: boolean }
  const rawFields: Field[] = []
  const pointDataContainer = root.querySelector('PointData')
  const cellDataContainer = root.querySelector('CellData')

  for (const el of els) {
    const name = el.getAttribute('Name')
    if (!name) continue
    const inPoint = pointDataContainer?.contains(el)
    const inCell = cellDataContainer?.contains(el)
    if (!inPoint && !inCell) continue
    const info = arrayOf.get(el)!
    const nc = info.nc || 1
    const vals = info.values
    const target = inCell ? vals.length / nc : info.values.length / nc
    void target
    if (nc === 1) {
      rawFields.push({ name, values: vals, cell: !!inCell })
    } else {
      // 多分量 -> 幅值
      const mag: number[] = []
      const rows = vals.length / nc
      for (let i = 0; i < rows; i++) {
        let s = 0
        for (let k = 0; k < nc; k++) s += (vals[i * nc + k] || 0) ** 2
        mag.push(Math.sqrt(s))
      }
      rawFields.push({ name: `${name} (幅值)`, values: mag, cell: !!inCell })
    }
  }

  const fields: FieldInfo[] = rawFields.map(f => ({ name: f.name + (f.cell ? ' (单元)' : ''), components: 1 }))
  const pointScalars: Record<string, Float32Array> = {}

  for (const f of rawFields) {
    if (!f.cell) {
      pointScalars[f.name] = new Float32Array(f.values)
    } else {
      // 单元场 -> 点场（按所属单元平均）
      const acc = new Float32Array(nPoints)
      const cnt = new Uint32Array(nPoints)
      let start = 0
      for (let c = 0; c < offsets.length; c++) {
        const end = offsets[c]
        const val = f.values[c] || 0
        for (let k = start; k < end; k++) {
          const v = connectivity[k]
          if (v < nPoints) { acc[v] += val; cnt[v]++ }
        }
        start = end
      }
      const arr = new Float32Array(nPoints)
      for (let i = 0; i < nPoints; i++) arr[i] = cnt[i] ? acc[i] / cnt[i] : 0
      pointScalars[f.name + ' (单元)'] = arr
    }
  }

  return { points, triangles: new Uint32Array(triangles), fields, pointScalars }
}

// ---------- 颜色映射 ----------
export function jetColor(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t))
  const r = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * x - 3)))
  const g = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * x - 2)))
  const b = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * x - 1)))
  return [r, g, b]
}

/** 根据场数据生成顶点颜色。 */
export function buildColors(values: Float32Array, min: number, max: number): Float32Array {
  const colors = new Float32Array(values.length * 3)
  const span = max - min || 1
  for (let i = 0; i < values.length; i++) {
    const t = (values[i] - min) / span
    const [r, g, b] = jetColor(t)
    colors[i * 3] = r
    colors[i * 3 + 1] = g
    colors[i * 3 + 2] = b
  }
  return colors
}

export function fieldRange(values: Float32Array): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v < min) min = v
    if (v > max) max = v
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1]
  if (min === max) return [min - 1, min + 1]
  return [min, max]
}
