import { useRef, useState } from 'react'
import DrawingCanvas from './DrawingCanvas'
import { submitCalibrationSample } from '../api/client'

// The known ground-truth label for each prompt is the LaTeX we ask the
// teacher to write — since we told them what to draw, we know it's correct.
const CALIBRATION_PROMPTS = [
  { label: '7', instruction: 'Write the digit 7' },
  { label: '4', instruction: 'Write the digit 4' },
  { label: '+', instruction: 'Write a plus sign' },
  { label: '-', instruction: 'Write a minus sign' },
  { label: '\\times', instruction: 'Write a multiplication sign (×)' },
  { label: '\\div', instruction: 'Write a division sign (÷)' },
  { label: '=', instruction: 'Write an equals sign' },
  { label: 'x', instruction: 'Write the variable x' },
  { label: 'y', instruction: 'Write the variable y' },
  { label: '2x + 3 = 7', instruction: 'Write the full equation: 2x + 3 = 7' },
]

export default function CalibrationFlow({ onDone, onSkip }) {
  const canvasRef = useRef(null)
  const [step, setStep] = useState(0)
  const [isEmpty, setIsEmpty] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const prompt = CALIBRATION_PROMPTS[step]
  const isLast = step === CALIBRATION_PROMPTS.length - 1

  async function handleSaveAndContinue() {
    setError('')
    setSaving(true)
    try {
      const blob = await canvasRef.current.toBlob()
      await submitCalibrationSample(blob, prompt.label)
      canvasRef.current.clear()
      if (isLast) {
        onDone()
      } else {
        setStep((s) => s + 1)
      }
    } catch {
      setError('Could not save this sample. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function handleRedo() {
    canvasRef.current.clear()
    setError('')
  }

  return (
    <div className="calibration-overlay">
      <div className="calibration-card">
        <h2>Calibrate your handwriting</h2>
        <p className="calibration-progress">
          Step {step + 1} of {CALIBRATION_PROMPTS.length}
        </p>
        <p className="calibration-instruction">{prompt.instruction}</p>
        <DrawingCanvas ref={canvasRef} width={400} height={200} onChange={setIsEmpty} />
        {error && <p className="error">{error}</p>}
        <div className="calibration-actions">
          <button onClick={handleRedo} disabled={isEmpty || saving}>
            Redo
          </button>
          <button onClick={handleSaveAndContinue} disabled={isEmpty || saving}>
            {saving ? 'Saving…' : isLast ? 'Finish' : 'Next'}
          </button>
        </div>
        <button className="calibration-skip" onClick={onSkip} disabled={saving}>
          Skip for now
        </button>
      </div>
    </div>
  )
}
