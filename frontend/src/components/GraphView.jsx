import { useEffect, useRef, useState } from 'react'
import { getGraphData } from '../api/client'
import { loadPlotly } from '../utils/plotly'
import { renderGraphData } from '../utils/plotGraph'
import Corners from './Corners'

export default function GraphView({ latex, t, onView3d }) {
  const plotRef = useRef(null)
  const plotlyRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [graphData, setGraphData] = useState(null)

  // A newly confirmed equation invalidates whatever was plotted before.
  useEffect(() => {
    setGraphData(null)
    setError('')
    if (plotlyRef.current && plotRef.current) {
      plotlyRef.current.purge(plotRef.current)
    }
  }, [latex])

  async function handleGraph() {
    setError('')
    setLoading(true)
    try {
      const [Plotly, data] = await Promise.all([loadPlotly(), getGraphData(latex)])
      plotlyRef.current = Plotly
      renderGraphData(Plotly, plotRef.current, data)
      setGraphData(data)
    } catch (err) {
      setError(err?.response?.data?.detail || t.graphError)
    } finally {
      setLoading(false)
    }
  }

  if (!latex) return null

  return (
    <div className="command-draft graph-card blueprint">
      <Corners />
      <div className="card-kicker">{t.graphLabel}</div>
      <button type="button" className="btn btn-secondary blueprint btn-block" onClick={handleGraph} disabled={loading}>
        <Corners />
        {loading ? t.graphing : t.graph}
      </button>
      {error && <p className="error">{error}</p>}
      <div ref={plotRef} className={graphData ? 'graph-plot' : 'graph-plot graph-plot-empty'} />
      {graphData?.type === '3d' && onView3d && (
        <button type="button" className="btn btn-secondary blueprint btn-block" onClick={() => onView3d({ kind: 'graph', latex, data: graphData })}>
          <Corners />
          {t.view3d}
        </button>
      )}
    </div>
  )
}
