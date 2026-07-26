// Renders the {type:'2d'|'3d', ...} shape returned by POST /api/graph (see
// backend/app/graphing.py) into a Plotly container. Shared by GraphView's
// inline preview and ThreeDView's fullscreen render so the two stay in sync
// instead of drifting apart.
export function renderGraphData(Plotly, container, data, options = {}) {
  if (!container) return

  const commonLayout = {
    paper_bgcolor: options.paperBg,
    plot_bgcolor: options.paperBg,
    font: options.font,
  }

  if (data.type === '2d') {
    const traces = data.traces.map((tr) => ({
      x: tr.x,
      y: tr.y,
      type: 'scatter',
      mode: 'lines',
      name: tr.label,
      connectgaps: false,
    }))
    Plotly.newPlot(
      container,
      traces,
      {
        ...commonLayout,
        margin: options.margin || { t: 20, r: 20, b: 40, l: 50 },
        xaxis: { title: data.x_label, color: options.axisColor, gridcolor: options.gridColor },
        yaxis: { title: data.y_label, color: options.axisColor, gridcolor: options.gridColor },
        showlegend: data.traces.length > 1,
      },
      { responsive: true, displayModeBar: options.displayModeBar ?? false },
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
    colorscale: options.colorscale || 'Blues',
  }))
  Plotly.newPlot(
    container,
    traces,
    {
      ...commonLayout,
      margin: options.margin || { t: 20, r: 20, b: 20, l: 20 },
      scene: {
        xaxis: { title: data.x_label, color: options.axisColor, gridcolor: options.gridColor },
        yaxis: { title: data.y_label, color: options.axisColor, gridcolor: options.gridColor },
        zaxis: { title: data.z_label, color: options.axisColor, gridcolor: options.gridColor },
        aspectmode: 'cube',
      },
    },
    { responsive: true, displayModeBar: options.displayModeBar ?? false },
  )
}
