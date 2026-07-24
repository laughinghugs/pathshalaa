import { useEffect, useRef, useState } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

// Lets the teacher confirm (or correct) the recognized LaTeX before moving on.
// An edited confirmation is reported back via onConfirm so the caller can
// store it as a correction sample for future few-shot calibration.
export default function LatexDisplay({ latex, onConfirm }) {
  const previewRef = useRef(null)
  const [editedLatex, setEditedLatex] = useState(latex)
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    setEditedLatex(latex)
    setConfirmed(false)
  }, [latex])

  useEffect(() => {
    if (!previewRef.current) return
    try {
      katex.render(editedLatex || '', previewRef.current, {
        throwOnError: false,
        displayMode: true,
      })
    } catch {
      previewRef.current.textContent = editedLatex
    }
  }, [editedLatex])

  if (!latex) return null

  function handleConfirm() {
    setConfirmed(true)
    onConfirm?.(editedLatex, editedLatex !== latex)
  }

  return (
    <div className="latex-display">
      <h2>Recognized equation</h2>
      <div ref={previewRef} className="latex-rendered" />
      <label className="latex-edit-label" htmlFor="latex-edit">
        Not quite right? Edit the LaTeX below, then confirm.
      </label>
      <textarea
        id="latex-edit"
        className="latex-edit"
        rows={2}
        value={editedLatex}
        onChange={(e) => {
          setEditedLatex(e.target.value)
          setConfirmed(false)
        }}
      />
      <button className="latex-confirm" onClick={handleConfirm} disabled={confirmed}>
        {confirmed ? 'Confirmed ✓' : 'Confirm'}
      </button>
    </div>
  )
}
