import { useRef, useState } from 'react'
import DrawingCanvas from './DrawingCanvas'
import { recognizeEquation } from '../api/client'

export default function EquationCanvas({ onRecognized }) {
  const canvasRef = useRef(null)
  const [isEmpty, setIsEmpty] = useState(true)
  const [recognizing, setRecognizing] = useState(false)
  const [error, setError] = useState('')

  async function handleRecognize() {
    setError('')
    setRecognizing(true)
    try {
      const blob = await canvasRef.current.toBlob()
      const latex = await recognizeEquation(blob)
      onRecognized(latex, blob)
    } catch {
      setError('Recognition failed. Please try again.')
    } finally {
      setRecognizing(false)
    }
  }

  return (
    <div className="equation-canvas">
      <DrawingCanvas ref={canvasRef} width={760} height={320} onChange={setIsEmpty} />
      <div className="canvas-toolbar">
        <button onClick={() => canvasRef.current.undo()} disabled={isEmpty}>
          Undo
        </button>
        <button onClick={() => canvasRef.current.clear()} disabled={isEmpty}>
          Clear
        </button>
        <button onClick={handleRecognize} disabled={isEmpty || recognizing}>
          {recognizing ? 'Recognizing…' : 'Recognize'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
