import { useEffect, useRef, useState } from 'react'
import { getGraphData } from '../api/client'

// plotly.js-dist-min is ~1.6MB gzipped (it bundles 2D + 3D trace support), so
// it's loaded lazily on first use rather than in the main bundle.
let plotlyPromise = null
function loadPlotly() {
  if (!plotlyPromise) {
    plotlyPromise = import('plotly.js-dist-min').then((mod) => mod.default ?? mod)
  }
  return plotlyPromise
}

export default function GraphView({ latex }) {
  const plotRef = useRef(null)
  const plotlyRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasGraph, setHasGraph] = useState(false)

  // A newly confirmed equation invalidates whatever was plotted before.
  useEffect(() => {
    setHasGraph(false)
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
      render(Plotly, data)
      setHasGraph(true)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not graph this equation.')
    } finally {
      setLoading(false)
    }
  }

  function render(Plotly, data) {
    if (!plotRef.current) return

    if (data.type === '2d') {
      const traces = data.traces.map((t) => ({
        x: t.x,
        y: t.y,
        type: 'scatter',
        mode: 'lines',
        name: t.label,
        connectgaps: false,
      }))
      Plotly.newPlot(
        plotRef.current,
        traces,
        {
          margin: { t: 20, r: 20, b: 40, l: 50 },
          xaxis: { title: data.x_label },
          yaxis: { title: data.y_label },
          showlegend: data.traces.length > 1,
        },
        { responsive: true, displayModeBar: false },
      )
      return
    }

    const traces = data.surfaces.map((s) => ({
      x: data.x,
      y: data.y,
      z: s.z,
      type: 'surface',
      name: s.label,
      showscale: false,
    }))
    Plotly.newPlot(
      plotRef.current,
      traces,
      {
        margin: { t: 20, r: 20, b: 20, l: 20 },
        scene: {
          xaxis: { title: data.x_label },
          yaxis: { title: data.y_label },
          zaxis: { title: data.z_label },
        },
      },
      { responsive: true, displayModeBar: false },
    )
  }

  if (!latex) return null

  return (
    <div className="graph-panel">
      <h2>Graph</h2>
      <button onClick={handleGraph} disabled={loading}>
        {loading ? 'Graphing…' : 'Graph'}
      </button>
      {error && <p className="error">{error}</p>}
      <div ref={plotRef} className={hasGraph ? 'graph-plot' : 'graph-plot graph-plot-empty'} />
    </div>
  )
}
