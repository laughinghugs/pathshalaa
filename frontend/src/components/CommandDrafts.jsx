import { useEffect, useRef, useState } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import Corners from './Corners'
import { loadPlotly } from '../utils/plotly'
import { buildShapeSurface, SHAPE_LABELS } from '../utils/shape3d'

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
        [{ x: surface.x, y: surface.y, z: surface.z, type: 'surface', showscale: false, colorscale: 'Blues' }],
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
          ) : draft.type === 'solution_steps' ? (
            <SolutionStepsCard command={draft} t={t} />
          ) : draft.type === 'shape3d' ? (
            <Shape3DCard command={draft} t={t} onView3d={onView3d} />
          ) : (
            <FallbackDraftCard command={draft} />
          )}
          {draft.type !== 'latex' && draft.type !== 'solve_equation' && (
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
