import { useEffect, useState } from 'react'
import { downloadUrl } from '../api'

interface Props {
  fileId: string
}

interface ArraySummary {
  name: string
  shape: number[]
  dtype: string
  size: number
  min?: number
  max?: number
  mean?: number
}

export default function ViewerChart({ fileId }: Props) {
  const [summary, setSummary] = useState<ArraySummary[] | null>(null)
  const [error, setError] = useState('')
  const [hasChart, setHasChart] = useState(false)

  useEffect(() => {
    fetch(downloadUrl(fileId, 'data'))
      .then(r => r.json())
      .then(j => setSummary(j.arrays || []))
      .catch(() => setError('数据摘要加载失败'))
    fetch(downloadUrl(fileId, 'chart'))
      .then(r => setHasChart(r.ok))
      .catch(() => setHasChart(false))
  }, [fileId])

  const fmt = (n: number | undefined) =>
    n === undefined || !Number.isFinite(n) ? '-' : Number(n).toExponential(3)

  return (
    <div className="chart-page">
      {error && <div className="viewer-error">{error}</div>}

      {hasChart && (
        <div className="chart-card">
          <div className="chart-title">图表预览</div>
          <img src={downloadUrl(fileId, 'chart')} alt="chart" style={{ width: '100%', borderRadius: 10 }} />
        </div>
      )}

      {summary && (
        <div className="chart-card">
          <div className="chart-title">数据摘要（{summary.length} 个数组）</div>
          <table className="data-table">
            <thead>
              <tr><th>名称</th><th>维度</th><th>类型</th><th>Min</th><th>Max</th><th>Mean</th></tr>
            </thead>
            <tbody>
              {summary.map((a, i) => (
                <tr key={i}>
                  <td title={a.name}>{a.name}</td>
                  <td>{a.shape.join('×')}</td>
                  <td>{a.dtype}</td>
                  <td>{fmt(a.min)}</td>
                  <td>{fmt(a.max)}</td>
                  <td>{fmt(a.mean)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
