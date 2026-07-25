import { useEffect, useRef, useState } from 'react'
import DrawingCanvas from './DrawingCanvas'
import Corners from './Corners'
import { recognizeEquation } from '../api/client'
import { validateCommands } from '../commands'

const FOCUS_REGION_MARGIN_PX = 20
// Auto mode waits this long after a stroke ends before recognizing, so a
// teacher mid-equation isn't interrupted — a new stroke cancels/restarts it.
const AUTO_RECOGNIZE_DELAY_MS = 2500

const PEN_WIDTHS = [
  { key: 'thin', label: 'Thin', value: 2.5, dot: 6 },
  { key: 'md', label: 'Medium', value: 4.5, dot: 9 },
  { key: 'thick', label: 'Thick', value: 7, dot: 13 },
]
const PEN_COLORS = [
  { key: 'ink', label: 'Ink', value: '#1d1f20' },
  { key: 'steel', label: 'Steel', value: '#416180' },
  { key: 'slate', label: 'Slate', value: '#7a7a7d' },
  { key: 'accent', label: 'Accent', value: '#5980a6' },
]

export default function EquationCanvas({ onRecognized, t }) {
  const canvasRef = useRef(null)
  const autoTimerRef = useRef(null)
  const recognizingRef = useRef(false)
  const [isEmpty, setIsEmpty] = useState(true)
  const [recognizing, setRecognizing] = useState(false)
  const [autoMode, setAutoMode] = useState(false)
  const [penWidthKey, setPenWidthKey] = useState('md')
  const [penColorKey, setPenColorKey] = useState('ink')
  const [error, setError] = useState('')

  useEffect(() => {
    recognizingRef.current = recognizing
  }, [recognizing])

  useEffect(() => clearAutoTimer, [])

  function clearAutoTimer() {
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current)
      autoTimerRef.current = null
    }
  }

  async function runRecognition() {
    setError('')
    setRecognizing(true)
    try {
      const blob = await canvasRef.current.toFocusRegionBlob(FOCUS_REGION_MARGIN_PX)
      const commands = await recognizeEquation(blob)
      onRecognized(validateCommands(commands), blob)
    } catch {
      setError(t.recognitionFailed)
    } finally {
      setRecognizing(false)
    }
  }

  function handleStrokeStart() {
    clearAutoTimer()
  }

  function handleStrokeEnd() {
    if (!autoMode) return
    clearAutoTimer()
    autoTimerRef.current = setTimeout(() => {
      autoTimerRef.current = null
      if (!recognizingRef.current) runRecognition()
    }, AUTO_RECOGNIZE_DELAY_MS)
  }

  function handleUndo() {
    clearAutoTimer()
    canvasRef.current.undo()
  }

  function handleClear() {
    clearAutoTimer()
    canvasRef.current.clear()
  }

  function toggleAutoMode() {
    setAutoMode((prev) => {
      if (prev) clearAutoTimer()
      return !prev
    })
  }

  const penWidth = PEN_WIDTHS.find((w) => w.key === penWidthKey).value
  const penColor = PEN_COLORS.find((c) => c.key === penColorKey).value

  return (
    <div className="board-canvas-frame blueprint">
      <Corners />
      <DrawingCanvas
        ref={canvasRef}
        color={penColor}
        lineWidth={penWidth}
        onChange={setIsEmpty}
        onStrokeStart={handleStrokeStart}
        onStrokeEnd={handleStrokeEnd}
      />
      {isEmpty && <div className="board-canvas-hint">{t.canvasHint}</div>}
      {error && (
        <p className="error" style={{ position: 'absolute', top: 12, left: 12, margin: 0 }}>
          {error}
        </p>
      )}

      <div className="board-toolbar blueprint elev-md">
        <Corners />
        <button
          type="button"
          className="btn btn-secondary btn-icon blueprint"
          aria-label={t.undo}
          title={t.undo}
          onClick={handleUndo}
          disabled={isEmpty}
        >
          <Corners />
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 14 4 9l5-5" />
            <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
          </svg>
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-icon blueprint"
          aria-label={t.clear}
          title={t.clear}
          onClick={handleClear}
          disabled={isEmpty}
        >
          <Corners />
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4L16.3 1.7a1 1 0 0 1 1.4 0l4.3 4.3a1 1 0 0 1 0 1.4L11.4 18" />
            <path d="M18 8 8.3 17.7" />
            <path d="M5 20h15" />
          </svg>
        </button>

        <span className="toolbar-divider" />
        {PEN_WIDTHS.map((w) => (
          <button
            key={w.key}
            type="button"
            title={w.label}
            className={w.key === penWidthKey ? 'pen-width-btn active' : 'pen-width-btn'}
            onClick={() => setPenWidthKey(w.key)}
          >
            <span className="pen-width-dot" style={{ width: w.dot, height: w.dot }} />
          </button>
        ))}

        <span className="toolbar-divider" />
        {PEN_COLORS.map((c) => (
          <button
            key={c.key}
            type="button"
            title={c.label}
            className={c.key === penColorKey ? 'pen-color-btn active' : 'pen-color-btn'}
            style={{ background: c.value }}
            onClick={() => setPenColorKey(c.key)}
          />
        ))}

        <span className="toolbar-divider" />
        <button type="button" className="btn btn-primary blueprint" onClick={runRecognition} disabled={isEmpty || recognizing}>
          <Corners />
          {recognizing ? t.recognizing : t.recognize}
        </button>
        <button
          type="button"
          className={autoMode ? 'toolbar-toggle active' : 'toolbar-toggle'}
          onClick={toggleAutoMode}
          aria-pressed={autoMode}
        >
          {t.auto}: {autoMode ? 'On' : 'Off'}
        </button>
      </div>
    </div>
  )
}
