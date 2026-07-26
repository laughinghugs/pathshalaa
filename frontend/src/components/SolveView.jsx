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

export default function SolveView({ latex, t }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [revealedCount, setRevealedCount] = useState(0)

  // A newly confirmed equation invalidates whatever was solved before.
  useEffect(() => {
    setResult(null)
    setRevealedCount(0)
    setError('')
  }, [latex])

  async function handleStartSolving() {
    setError('')
    setLoading(true)
    try {
      const data = await solveEquation(latex)
      setResult(data)
      setRevealedCount(1)
    } catch (err) {
      setError(err?.response?.data?.detail || t.solveError)
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
        <button
          type="button"
          className="btn btn-secondary blueprint btn-block"
          onClick={handleStartSolving}
          disabled={loading}
        >
          <Corners />
          {loading ? t.solving : t.solve}
        </button>
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
            </div>
          )}
        </>
      )}
    </div>
  )
}
