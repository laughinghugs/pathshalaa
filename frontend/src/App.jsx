import { useEffect, useState } from 'react'
import Login from './components/Login'
import CalibrationFlow from './components/CalibrationFlow'
import EquationCanvas from './components/EquationCanvas'
import CommandDrafts from './components/CommandDrafts'
import GraphView from './components/GraphView'
import { getToken, getUser, logout, getCalibrationStatus, submitCorrection } from './api/client'

function calibrationSkippedKey(email) {
  return `pathshalaa_calibration_skipped_${email}`
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(!!getToken())
  const [user, setUser] = useState(getUser())
  const [showCalibration, setShowCalibration] = useState(false)
  const [commands, setCommands] = useState([])
  const [confirmedLatex, setConfirmedLatex] = useState('')
  const [lastImageBlob, setLastImageBlob] = useState(null)

  // On a teacher's first login (no calibration samples yet, and they
  // haven't explicitly skipped before), offer the onboarding flow.
  useEffect(() => {
    if (!loggedIn || !user) return
    let cancelled = false
    getCalibrationStatus()
      .then((count) => {
        if (cancelled) return
        const alreadySkipped = localStorage.getItem(calibrationSkippedKey(user.email))
        if (count === 0 && !alreadySkipped) {
          setShowCalibration(true)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [loggedIn, user])

  function handleLoggedIn() {
    setUser(getUser())
    setLoggedIn(true)
  }

  function handleLogout() {
    logout()
    setLoggedIn(false)
    setUser(null)
    setCommands([])
    setLastImageBlob(null)
  }

  function handleRecognized(newCommands, blob) {
    setCommands(newCommands)
    setLastImageBlob(blob)
    setConfirmedLatex('')
  }

  function handleConfirm(finalLatex, wasEdited) {
    setConfirmedLatex(finalLatex)
    if (wasEdited && lastImageBlob) {
      // The teacher corrected a misread result — store it so future
      // recognitions for this teacher can learn from it (few-shot).
      submitCorrection(lastImageBlob, finalLatex).catch(() => {})
    }
  }

  function handleCalibrationDone() {
    setShowCalibration(false)
  }

  function handleCalibrationSkip() {
    if (user) {
      localStorage.setItem(calibrationSkippedKey(user.email), '1')
    }
    setShowCalibration(false)
  }

  if (!loggedIn) {
    return <Login onLoggedIn={handleLoggedIn} />
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Pathshalaa</h1>
        <div className="app-header-actions">
          {user && <span className="app-header-user">{user.name}</span>}
          <button onClick={() => setShowCalibration(true)}>Calibrate my handwriting</button>
          <button onClick={handleLogout}>Log out</button>
        </div>
      </header>
      <main>
        <EquationCanvas onRecognized={handleRecognized} />
        <CommandDrafts commands={commands} onLatexAccept={handleConfirm} />
        <GraphView latex={confirmedLatex} />
      </main>
      {showCalibration && (
        <CalibrationFlow onDone={handleCalibrationDone} onSkip={handleCalibrationSkip} />
      )}
    </div>
  )
}
