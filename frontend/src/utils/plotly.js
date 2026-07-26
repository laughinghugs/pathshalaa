// plotly.js-dist-min is ~1.6MB gzipped (it bundles 2D + 3D trace support), so
// it's loaded lazily on first use rather than in the main bundle. Shared
// across GraphView and ThreeDView so both hit the same cached import.
let plotlyPromise = null
export function loadPlotly() {
  if (!plotlyPromise) {
    plotlyPromise = import('plotly.js-dist-min').then((mod) => mod.default ?? mod)
  }
  return plotlyPromise
}
