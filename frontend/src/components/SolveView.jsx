import { useEffect, useRef, useState } from 'react'
import renderMathInElement from 'katex/contrib/auto-render'
import 'katex/dist/katex.min.css'
import { solveEquation } from '../api/client'
import Corners from './Corners'

// Steps come back from the LLM with inline math wrapped in single $...$
// (see build_solve_prompt in backend/app/solving.py) — auto-render walks the
// rendered step text and replaces each delimited span with KaTeX, leaving
// the surrounding prose untouched.
function MathText({ text }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current) return
    renderMathInElement(ref.current, {
      delimiters: [{ left: '$', right: '$', display: false }],
      throwOnError: false,
    })
  }, [text])
  return <span ref={ref}>{text}</span>
}

export default function SolveView({ latex, autoSolve, t }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [revealedCount, setRevealedCount] = useState(0)
  const [showRange, setShowRange] = useState(false)
  const [rangeMin, setRangeMin] = useState('')
  const [rangeMax, setRangeMax] = useState('')

  // A newly confirmed equation invalidates whatever was solved before.
  useEffect(() => {
    setResult(null)
    setRevealedCount(0)
    setError('')
    setShowRange(false)
    setRangeMin('')
    setRangeMax('')
  }, [latex])

  // The teacher already wrote "solve ... for [a, b)" on the canvas and
  // confirmed it once (see CommandDrafts' SolveEquationDraftCard) — solve
  // immediately instead of making them press Solve again / re-enter a range
  // that's already on the page. Keyed on `latex` alone (not `autoSolve`,
  // whose object identity changes every render) so this fires exactly once
  // per confirmed equation.
  useEffect(() => {
    if (latex && autoSolve) {
      handleStartSolving(autoSolve.range ?? null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latex])

  async function handleStartSolving(rangeOverride) {
    setError('')
    setLoading(true)
    try {
      const range =
        rangeOverride !== undefined
          ? rangeOverride
          : showRange && rangeMin !== '' && rangeMax !== ''
            ? { min: rangeMin, max: rangeMax, minInclusive: true, maxInclusive: true }
            : null
      const data = await solveEquation(latex, range)
      setResult(data)
      setRevealedCount(1)
    } catch (err) {
      const detail = err?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : t.solveError)
    } finally {
      setLoading(false)
    }
  }

  function handleRevealNext() {
    setRevealedCount((n) => Math.min(n + 1, result.steps.length))
  }

  if (!latex) return null

  const allRevealed = result && revealedCount >= result.steps.length

  return (
    <div className="command-draft solve-card blueprint">
      <Corners />
      <div className="card-kicker">{t.solutionTitle}</div>

      {!result && (
        autoSolve ? (
          loading && <p className="solve-auto-loading">{t.solving}</p>
        ) : (
          <>
            <label className="solve-range-toggle">
              <input type="checkbox" checked={showRange} onChange={(e) => setShowRange(e.target.checked)} />
              {t.solveRangeToggle}
            </label>
            {showRange && (
              <>
                <div className="solve-range-fields">
                  <label>
                    {t.solveRangeFrom}
                    <input
                      type="number"
                      step="any"
                      value={rangeMin}
                      onChange={(e) => setRangeMin(e.target.value)}
                    />
                  </label>
                  <label>
                    {t.solveRangeTo}
                    <input
                      type="number"
                      step="any"
                      value={rangeMax}
                      onChange={(e) => setRangeMax(e.target.value)}
                    />
                  </label>
                </div>
                <p className="solve-range-hint">{t.solveRangeHint}</p>
              </>
            )}
            <button
              type="button"
              className="btn btn-secondary blueprint btn-block"
              onClick={() => handleStartSolving(undefined)}
              disabled={loading}
            >
              <Corners />
              {loading ? t.solving : t.solve}
            </button>
          </>
        )
      )}

      {error && <p className="error">{error}</p>}

      {result && (
        <>
          <div className="solution-steps">
            {result.steps.slice(0, revealedCount).map((step, i) => (
              <div className="solution-step" key={i}>
                <span className="solution-step-n">{i + 1}</span>
                <span className="solution-step-text">
                  <MathText text={step} />
                </span>
              </div>
            ))}
          </div>

          {!allRevealed ? (
            <button type="button" className="btn btn-secondary blueprint btn-block" onClick={handleRevealNext}>
              <Corners />
              {t.revealNextStep}
            </button>
          ) : (
            <div className="solve-final-answer">
              <span className="card-kicker">{t.finalAnswer}</span>
              <MathText text={`$${result.final_answer}$`} />
              {result.domain_note && (
                <div className="solve-domain-note">
                  <MathText text={`$${result.domain_note}$`} />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
