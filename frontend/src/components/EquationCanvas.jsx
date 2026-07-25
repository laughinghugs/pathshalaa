import { useEffect, useRef, useState } from 'react'
import DrawingCanvas from './DrawingCanvas'
import { recognizeEquation } from '../api/client'
import { validateCommands } from '../commands'

const FOCUS_REGION_MARGIN_PX = 20
// Auto mode waits this long after a stroke ends before recognizing, so a
// teacher mid-equation isn't interrupted — a new stroke cancels/restarts it.
const AUTO_RECOGNIZE_DELAY_MS = 2500

export default function EquationCanvas({ onRecognized }) {
  const canvasRef = useRef(null)
  const autoTimerRef = useRef(null)
  const recognizingRef = useRef(false)
  const [isEmpty, setIsEmpty] = useState(true)
  const [recognizing, setRecognizing] = useState(false)
  const [autoMode, setAutoMode] = useState(false)
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
      setError('Recognition failed. Please try again.')
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

  return (
    <div className="equation-canvas">
      <DrawingCanvas
        ref={canvasRef}
        width={760}
        height={320}
        onChange={setIsEmpty}
        onStrokeStart={handleStrokeStart}
        onStrokeEnd={handleStrokeEnd}
      />
      <div className="canvas-toolbar">
        <button onClick={handleUndo} disabled={isEmpty}>
          Undo
        </button>
        <button onClick={handleClear} disabled={isEmpty}>
          Clear
        </button>
        <button onClick={runRecognition} disabled={isEmpty || recognizing}>
          {recognizing ? 'Recognizing…' : 'Recognize'}
        </button>
        <button
          type="button"
          className={autoMode ? 'auto-toggle active' : 'auto-toggle'}
          onClick={toggleAutoMode}
          aria-pressed={autoMode}
        >
          Auto: {autoMode ? 'On' : 'Off'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
