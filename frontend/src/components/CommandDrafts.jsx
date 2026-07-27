import { useEffect, useRef, useState } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import Corners from './Corners'
import MathText from './MathText'
import { loadPlotly } from '../utils/plotly'
import { buildShapeSurface, buildPlotlyTraces, SHAPE_LABELS } from '../utils/shape3d'
import { calculateMensuration } from '../api/client'

const MENSURATION_SHAPE_FIELDS = {
  cone: ['radius', 'height'],
  sphere: ['radius'],
  cylinder: ['radius', 'height'],
  cuboid: ['length', 'width', 'height'],
}

// The generic draft/confirm layer for ALL AI output (item 2 of the
// recognition refactor): every command coming back from /api/recognize
// starts as an "unconfirmed draft" (blueprint frame) until the teacher hits
// Accept or Discard. `latex` and `solution_steps` have dedicated renderers —
// the rest (graph, shape3d, translation) get a minimal fallback display so
// the pattern already works end-to-end for whatever a future subject-agent
// plugin adds, without new feature UI being built here.

let idCounter = 0
function nextId() {
  idCounter += 1
  return idCounter
}

const TYPE_LABELS = {
  latex: 'Recognized equation',
  graph: 'Graph',
  shape3d: '3D shape',
  shape_mensuration: 'Solid dimensions',
  solution_steps: 'Solution steps',
  translation: 'Translation',
}

function LatexDraftCard({ command, accepted, onAccept, t }) {
  const previewRef = useRef(null)
  const [editedContent, setEditedContent] = useState(command.content)

  useEffect(() => {
    if (!previewRef.current) return
    try {
      katex.render(editedContent || '', previewRef.current, {
        throwOnError: false,
        displayMode: true,
      })
    } catch {
      previewRef.current.textContent = editedContent
    }
  }, [editedContent])

  return (
    <>
      <div className="card-kicker">{t.recognizedLabel}</div>
      <div ref={previewRef} className="latex-rendered" />
      <label className="latex-edit-label" htmlFor={`latex-edit-${command._id}`}>
        {t.notQuiteRight}
      </label>
      <textarea
        id={`latex-edit-${command._id}`}
        className="latex-edit"
        rows={2}
        value={editedContent}
        disabled={accepted}
        onChange={(e) => setEditedContent(e.target.value)}
      />
      {!accepted && (
        <button
          type="button"
          className="btn btn-primary blueprint btn-block"
          onClick={() => onAccept(editedContent, editedContent !== command.content)}
        >
          <Corners />
          {t.confirm}
        </button>
      )}
    </>
  )
}

function SolveEquationDraftCard({ command, accepted, onAccept, t }) {
  const previewRef = useRef(null)
  const [editedContent, setEditedContent] = useState(command.content)
  const [rangeMin, setRangeMin] = useState(command.range_min ?? '')
  const [rangeMax, setRangeMax] = useState(command.range_max ?? '')
  const [minInclusive, setMinInclusive] = useState(command.range_min_inclusive ?? true)
  const [maxInclusive, setMaxInclusive] = useState(command.range_max_inclusive ?? true)

  useEffect(() => {
    if (!previewRef.current) return
    try {
      katex.render(editedContent || '', previewRef.current, {
        throwOnError: false,
        displayMode: true,
      })
    } catch {
      previewRef.current.textContent = editedContent
    }
  }, [editedContent])

  const hasRange = rangeMin.trim() !== '' && rangeMax.trim() !== ''

  return (
    <>
      <div className="card-kicker">{t.solveDraftLabel}</div>
      <div ref={previewRef} className="latex-rendered" />
      <label className="latex-edit-label" htmlFor={`solve-edit-${command._id}`}>
        {t.notQuiteRight}
      </label>
      <textarea
        id={`solve-edit-${command._id}`}
        className="latex-edit"
        rows={2}
        value={editedContent}
        disabled={accepted}
        onChange={(e) => setEditedContent(e.target.value)}
      />
      <div className="solve-range-fields">
        <label>
          {t.solveRangeFrom}
          <button
            type="button"
            className="range-bracket-toggle"
            disabled={accepted}
            title={t.solveRangeBracketHint}
            onClick={() => setMinInclusive((v) => !v)}
          >
            {minInclusive ? '[' : '('}
          </button>
          <input
            type="text"
            value={rangeMin}
            disabled={accepted}
            placeholder="0"
            onChange={(e) => setRangeMin(e.target.value)}
          />
        </label>
        <label>
          {t.solveRangeTo}
          <input
            type="text"
            value={rangeMax}
            disabled={accepted}
            placeholder="2\pi"
            onChange={(e) => setRangeMax(e.target.value)}
          />
          <button
            type="button"
            className="range-bracket-toggle"
            disabled={accepted}
            title={t.solveRangeBracketHint}
            onClick={() => setMaxInclusive((v) => !v)}
          >
            {maxInclusive ? ']' : ')'}
          </button>
        </label>
      </div>
      {!accepted && (
        <button
          type="button"
          className="btn btn-primary blueprint btn-block"
          onClick={() =>
            onAccept(
              editedContent,
              hasRange ? { min: rangeMin.trim(), max: rangeMax.trim(), minInclusive, maxInclusive } : null,
            )
          }
        >
          <Corners />
          {t.confirm}
        </button>
      )}
    </>
  )
}

function RevealSteps({ title, steps, t }) {
  const [revealedCount, setRevealedCount] = useState(1)
  const allRevealed = revealedCount >= steps.length

  return (
    <div className="mensuration-quantity">
      <div className="card-kicker">{title}</div>
      <div className="solution-steps">
        {steps.slice(0, revealedCount).map((step, i) => (
          <div className="solution-step" key={i}>
            <span className="solution-step-n">{i + 1}</span>
            <span className="solution-step-text">
              <MathText text={step} />
            </span>
          </div>
        ))}
      </div>
      {!allRevealed && (
        <button
          type="button"
          className="btn btn-secondary blueprint btn-block"
          onClick={() => setRevealedCount((n) => Math.min(n + 1, steps.length))}
        >
          <Corners />
          {t.revealNextStep}
        </button>
      )}
    </div>
  )
}

function ShapeMensurationDraftCard({ command, accepted, onAccept, onView3d, t }) {
  const [shape, setShape] = useState(command.shape)
  const [dimensions, setDimensions] = useState(() => {
    const initial = {}
    for (const [key, value] of Object.entries(command.dimensions || {})) {
      if (value != null) initial[key] = value
    }
    return initial
  })
  const [unit, setUnit] = useState(command.unit || '')
  const [calculating, setCalculating] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const plotRef = useRef(null)

  // A cube is usually hand-labeled with one "side" rather than separate
  // length/width/height — keep that single field instead of demanding the
  // teacher re-enter the same number three times.
  const isCubeShorthand =
    shape === 'cuboid' && dimensions.side != null && dimensions.length == null && dimensions.width == null && dimensions.height == null
  const fields = shape === 'cuboid' ? (isCubeShorthand ? ['side'] : ['length', 'width', 'height']) : MENSURATION_SHAPE_FIELDS[shape]
  const missing = fields.filter((f) => dimensions[f] == null || dimensions[f] === '')

  useEffect(() => {
    if (!result || !plotRef.current) return
    let cancelled = false
    loadPlotly().then((Plotly) => {
      if (cancelled || !plotRef.current) return
      const surface = buildShapeSurface(result.shape, { ...result.dimensions, unit: result.unit })
      Plotly.newPlot(
        plotRef.current,
        buildPlotlyTraces(surface, { labelColor: '#2b2b2d' }),
        { margin: { t: 10, r: 10, b: 10, l: 10 }, scene: { aspectmode: 'data' } },
        { responsive: true, displayModeBar: false },
      )
    })
    return () => {
      cancelled = true
    }
  }, [result])

  function handleShapeChange(nextShape) {
    setShape(nextShape)
    setDimensions({})
    setResult(null)
  }

  async function handleCalculate() {
    setError('')
    setCalculating(true)
    try {
      const numericDimensions = Object.fromEntries(
        Object.entries(dimensions)
          .filter(([, v]) => v !== '' && v != null)
          .map(([k, v]) => [k, Number(v)]),
      )
      const data = await calculateMensuration(shape, numericDimensions, unit)
      setResult(data)
      onAccept?.()
    } catch (err) {
      const detail = err?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : t.mensurationError)
    } finally {
      setCalculating(false)
    }
  }

  return (
    <>
      <div className="card-kicker">{t.mensurationDraftLabel}</div>

      {!result && (
        <>
          <div className="mensuration-fields">
            <select value={shape} disabled={accepted} onChange={(e) => handleShapeChange(e.target.value)}>
              {Object.keys(MENSURATION_SHAPE_FIELDS).map((s) => (
                <option key={s} value={s}>
                  {SHAPE_LABELS[s]}
                </option>
              ))}
            </select>
            {fields.map((field) => (
              <label key={field} className="mensuration-dim-field">
                {field}
                <input
                  type="number"
                  step="any"
                  disabled={accepted}
                  value={dimensions[field] ?? ''}
                  onChange={(e) => setDimensions((d) => ({ ...d, [field]: e.target.value }))}
                />
              </label>
            ))}
            <label className="mensuration-dim-field">
              {t.mensurationUnitLabel}
              <input
                type="text"
                placeholder="cm"
                disabled={accepted}
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
            </label>
          </div>
          {missing.length > 0 && (
            <p className="mensuration-missing-hint">
              {t.mensurationMissingHint}: {missing.join(', ')}
            </p>
          )}
          {error && <p className="error">{error}</p>}
          <button
            type="button"
            className="btn btn-primary blueprint btn-block"
            onClick={handleCalculate}
            disabled={calculating || missing.length > 0}
          >
            <Corners />
            {calculating ? t.mensurationCalculating : t.mensurationCalculate}
          </button>
        </>
      )}

      {result && (
        <>
          <div ref={plotRef} className="graph-plot mensuration-plot" />
          {onView3d && (
            <button
              type="button"
              className="btn btn-secondary blueprint btn-block"
              onClick={() =>
                onView3d({
                  kind: 'shape3d',
                  shape: result.shape,
                  params: { ...result.dimensions, unit: result.unit },
                })
              }
            >
              <Corners />
              {t.view3d}
            </button>
          )}
          <RevealSteps title={t.mensurationSurfaceArea} steps={result.surface_area_steps} t={t} />
          <RevealSteps title={t.mensurationVolume} steps={result.volume_steps} t={t} />
        </>
      )}
    </>
  )
}

function SolutionStepsCard({ command, t }) {
  return (
    <>
      <div className="card-kicker">{t.solutionTitle}</div>
      <div className="solution-steps">
        {command.steps.map((step, i) => (
          <div className="solution-step" key={i}>
            <span className="solution-step-n">{i + 1}</span>
            <span className="solution-step-text">{step}</span>
          </div>
        ))}
      </div>
    </>
  )
}

function Shape3DCard({ command, t, onView3d }) {
  const plotRef = useRef(null)

  // Params are already fully known the moment the command arrives (unlike
  // Graph, which needs a network round-trip), so the preview renders
  // immediately instead of waiting for a button press.
  useEffect(() => {
    let cancelled = false
    const surface = buildShapeSurface(command.shape, command.params)
    if (!surface) return
    loadPlotly().then((Plotly) => {
      if (cancelled || !plotRef.current) return
      Plotly.newPlot(
        plotRef.current,
        buildPlotlyTraces(surface, { labelColor: '#2b2b2d' }),
        { margin: { t: 10, r: 10, b: 10, l: 10 }, scene: { aspectmode: 'data' } },
        { responsive: true, displayModeBar: false },
      )
    })
    return () => {
      cancelled = true
    }
  }, [command.shape, command.params])

  return (
    <>
      <div className="card-kicker">{SHAPE_LABELS[command.shape] || command.type}</div>
      <div ref={plotRef} className="graph-plot" />
      {onView3d && (
        <button
          type="button"
          className="btn btn-secondary blueprint btn-block"
          onClick={() => onView3d({ kind: 'shape3d', shape: command.shape, params: command.params })}
        >
          <Corners />
          {t.view3d}
        </button>
      )}
    </>
  )
}

function FallbackDraftCard({ command }) {
  const { type: _type, _id, _accepted, ...fields } = command
  return (
    <>
      <div className="card-kicker">{TYPE_LABELS[command.type] ?? command.type}</div>
      <pre className="command-draft-raw">{JSON.stringify(fields, null, 2)}</pre>
    </>
  )
}

export default function CommandDrafts({ commands, onLatexAccept, onSolveEquationAccept, onView3d, t }) {
  const [drafts, setDrafts] = useState([])

  // A fresh batch of recognized commands replaces whatever was drafted
  // before — matches the previous single-shot LatexDisplay behavior.
  useEffect(() => {
    setDrafts((commands || []).map((cmd) => ({ ...cmd, _id: nextId(), _accepted: false })))
  }, [commands])

  function handleDiscard(id) {
    setDrafts((prev) => prev.filter((d) => d._id !== id))
  }

  function handleAcceptGeneric(id) {
    setDrafts((prev) => prev.map((d) => (d._id === id ? { ...d, _accepted: true } : d)))
  }

  function handleLatexAccept(id, finalContent, wasEdited) {
    setDrafts((prev) => prev.map((d) => (d._id === id ? { ...d, _accepted: true } : d)))
    onLatexAccept?.(finalContent, wasEdited)
  }

  function handleSolveEquationAccept(id, finalContent, range) {
    setDrafts((prev) => prev.map((d) => (d._id === id ? { ...d, _accepted: true } : d)))
    onSolveEquationAccept?.(finalContent, range)
  }

  function handleMensurationAccept(id) {
    setDrafts((prev) => prev.map((d) => (d._id === id ? { ...d, _accepted: true } : d)))
  }

  if (drafts.length === 0) {
    return <div className="ai-panel-empty">{t.recognizeHint}</div>
  }

  return (
    <>
      {drafts.map((draft) => (
        <div key={draft._id} className="command-draft blueprint">
          <Corners />
          {draft.type === 'latex' ? (
            <LatexDraftCard
              command={draft}
              accepted={draft._accepted}
              onAccept={(content, wasEdited) => handleLatexAccept(draft._id, content, wasEdited)}
              t={t}
            />
          ) : draft.type === 'solve_equation' ? (
            <SolveEquationDraftCard
              command={draft}
              accepted={draft._accepted}
              onAccept={(content, range) => handleSolveEquationAccept(draft._id, content, range)}
              t={t}
            />
          ) : draft.type === 'shape_mensuration' ? (
            <ShapeMensurationDraftCard
              command={draft}
              accepted={draft._accepted}
              onAccept={() => handleMensurationAccept(draft._id)}
              onView3d={onView3d}
              t={t}
            />
          ) : draft.type === 'solution_steps' ? (
            <SolutionStepsCard command={draft} t={t} />
          ) : draft.type === 'shape3d' ? (
            <Shape3DCard command={draft} t={t} onView3d={onView3d} />
          ) : (
            <FallbackDraftCard command={draft} />
          )}
          {draft.type !== 'latex' && draft.type !== 'solve_equation' && draft.type !== 'shape_mensuration' && (
            <div className="command-draft-actions">
              {draft._accepted ? (
                <span className="command-draft-status">{t.confirmedStatus}</span>
              ) : (
                <>
                  <button type="button" className="btn btn-secondary" onClick={() => handleAcceptGeneric(draft._id)}>
                    {t.confirm}
                  </button>
                  <button type="button" className="btn btn-danger" onClick={() => handleDiscard(draft._id)}>
                    Discard
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </>
  )
}
