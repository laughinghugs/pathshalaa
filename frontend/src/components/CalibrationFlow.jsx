import { useRef, useState } from 'react'
import DrawingCanvas from './DrawingCanvas'
import Corners from './Corners'
import { submitCalibrationSample } from '../api/client'

// The known ground-truth label for each prompt is the LaTeX we ask the
// teacher to write — since we told them what to draw, we know it's correct.
const CALIBRATION_PROMPTS = [
  { label: '7', symbol: '7', instruction: 'Write the digit 7' },
  { label: '4', symbol: '4', instruction: 'Write the digit 4' },
  { label: '+', symbol: '+', instruction: 'Write a plus sign' },
  { label: '-', symbol: '−', instruction: 'Write a minus sign' },
  { label: '\\times', symbol: '×', instruction: 'Write a multiplication sign (×)' },
  { label: '\\div', symbol: '÷', instruction: 'Write a division sign (÷)' },
  { label: '=', symbol: '=', instruction: 'Write an equals sign' },
  { label: 'x', symbol: 'x', instruction: 'Write the variable x' },
  { label: 'y', symbol: 'y', instruction: 'Write the variable y' },
  { label: '2x + 3 = 7', symbol: '2x+3=7', instruction: 'Write the full equation: 2x + 3 = 7' },
]

export default function CalibrationFlow({ onDone, onSkip, t }) {
  const canvasRef = useRef(null)
  const [step, setStep] = useState(0)
  const [isEmpty, setIsEmpty] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

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
        setDone(true)
      } else {
        setStep((s) => s + 1)
      }
    } catch {
      setError(t.saveSampleError)
    } finally {
      setSaving(false)
    }
  }

  function handleRedo() {
    canvasRef.current.clear()
    setError('')
  }

  return (
    <div className="onboard-overlay">
      <div className="onboard-screen">
        <div className="onboard-topbar">
          <span className="brand">{t.brand}</span>
          {!done && (
            <span className="tag tag-neutral">
              {step + 1} {t.onboardStepOf} {CALIBRATION_PROMPTS.length}
            </span>
          )}
          <button type="button" className="btn btn-ghost" onClick={onSkip} disabled={saving}>
            {t.onboardSkip}
          </button>
        </div>

        {done ? (
          <div className="onboard-done-card blueprint elev-lg">
            <Corners />
            <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-700)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <h2>{t.onboardDoneTitle}</h2>
            <p>{t.onboardDoneBody}</p>
            <button type="button" className="btn btn-primary blueprint" style={{ padding: '14px 32px', fontSize: 16 }} onClick={onDone}>
              <Corners />
              {t.onboardStart}
            </button>
          </div>
        ) : (
          <>
            <h1 className="onboard-title">{t.calibrateTitle}</h1>
            <p className="onboard-body">{prompt.instruction}</p>
            <div className="onboard-symbol">{prompt.symbol}</div>
            <div className="onboard-canvas-box blueprint">
              <Corners />
              <DrawingCanvas ref={canvasRef} onChange={setIsEmpty} />
            </div>
            {error && <p className="error">{error}</p>}
            <div className="onboard-dots">
              {CALIBRATION_PROMPTS.map((p, i) => (
                <span key={p.label} className={`onboard-dot${i < step ? ' done' : i === step ? ' current' : ''}`} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={handleRedo} disabled={isEmpty || saving}>
                {t.onboardRedo}
              </button>
              <button type="button" className="btn btn-primary blueprint" style={{ padding: '10px 28px' }} onClick={handleSaveAndContinue} disabled={isEmpty || saving}>
                <Corners />
                {saving ? t.onboardSaving : isLast ? t.onboardFinish : t.onboardNext}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
