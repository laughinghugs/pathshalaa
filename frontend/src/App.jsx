import { useEffect, useState } from 'react'
import Login from './components/Login'
import TrialExpired from './components/TrialExpired'
import CalibrationFlow from './components/CalibrationFlow'
import EquationCanvas from './components/EquationCanvas'
import CommandDrafts from './components/CommandDrafts'
import SolveView from './components/SolveView'
import GraphView from './components/GraphView'
import ThreeDView from './components/ThreeDView'
import OwnerDashboard from './components/OwnerDashboard'
import { getToken, getUser, logout, getCalibrationStatus, submitCorrection, onTrialExpired, getMe } from './api/client'
import { COPY, getLang, setLang as persistLang } from './i18n'

function calibrationSkippedKey(email) {
  return `pathshalaa_calibration_skipped_${email}`
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(!!getToken())
  const [user, setUser] = useState(getUser())
  const [showCalibration, setShowCalibration] = useState(false)
  const [commands, setCommands] = useState([])
  const [confirmedLatex, setConfirmedLatex] = useState('')
  const [autoSolve, setAutoSolve] = useState(null)
  const [lastImageBlob, setLastImageBlob] = useState(null)
  const [lang, setLangState] = useState(getLang)
  const [screen, setScreen] = useState('board')
  const [threeDPayload, setThreeDPayload] = useState(null)
  const [panelDock, setPanelDock] = useState('side')
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [trialExpiredMessage, setTrialExpiredMessage] = useState(null)
  const [role, setRole] = useState(null)
  const t = COPY[lang]

  // Registered once for the app's lifetime; the interceptor in api/client.js
  // fires this whenever any request 403s with the trial_expired error, so a
  // dedicated screen replaces the board instead of the caller having to
  // check for this on every single API call.
  useEffect(() => {
    return onTrialExpired((message) => setTrialExpiredMessage(message))
  }, [])

  // Only used to gate the Owner dashboard entry point in the nav — the
  // backend re-checks the role on every admin call regardless (see
  // require_permission in app/rbac/dependencies.py), so this can't be used
  // to grant access, only to hide/show the button.
  useEffect(() => {
    if (!loggedIn) {
      setRole(null)
      return
    }
    let cancelled = false
    getMe()
      .then((me) => {
        if (!cancelled) setRole(me.role)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [loggedIn])

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

  useEffect(() => {
    if (!showUserMenu) return
    function handleOutsideClick(e) {
      if (!e.target.closest('.user-menu-wrap')) setShowUserMenu(false)
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [showUserMenu])

  function handleLangChange(next) {
    setLangState(next)
    persistLang(next)
  }

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
    setScreen('board')
    setTrialExpiredMessage(null)
    setRole(null)
  }

  function handleRecognized(newCommands, blob) {
    setCommands(newCommands)
    setLastImageBlob(blob)
    setConfirmedLatex('')
    setAutoSolve(null)
  }

  function handleConfirm(finalLatex, wasEdited) {
    setConfirmedLatex(finalLatex)
    setAutoSolve(null)
    if (wasEdited && lastImageBlob) {
      // The teacher corrected a misread result — store it so future
      // recognitions for this teacher can learn from it (few-shot).
      submitCorrection(lastImageBlob, finalLatex).catch(() => {})
    }
  }

  // The teacher wrote an explicit "solve ... [for a range]" instruction on
  // the canvas (see SolveEquationDraftCard) and confirmed it once — that
  // single confirm is the only click needed; SolveView auto-triggers from
  // `autoSolve` instead of waiting for its own Solve button.
  function handleSolveEquationConfirm(finalLatex, range) {
    setConfirmedLatex(finalLatex)
    setAutoSolve({ range })
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

  function handleView3d(payload) {
    setThreeDPayload(payload)
    setScreen('3d')
  }

  function togglePanelDock() {
    setPanelDock((d) => (d === 'side' ? 'bottom' : 'side'))
  }

  if (!loggedIn) {
    return <Login onLoggedIn={handleLoggedIn} />
  }

  if (trialExpiredMessage) {
    return <TrialExpired message={trialExpiredMessage} onLogout={handleLogout} t={t} />
  }

  return (
    <div className="app">
      {screen === '3d' ? (
        <ThreeDView t={t} payload={threeDPayload} onBack={() => setScreen('board')} />
      ) : screen === 'owner' ? (
        <OwnerDashboard onBack={() => setScreen('board')} />
      ) : (
        <>
          <nav className="nav">
            <span className="nav-brand">
              <span className="brand-mark">π</span>
              {t.brand}
            </span>
            <span style={{ flex: 1 }} />
            {role === 'owner' && (
              <button type="button" className="btn btn-ghost" onClick={() => setScreen('owner')}>
                Owner
              </button>
            )}
            <div className="lang-switch">
              <button type="button" className={lang === 'en' ? 'active' : ''} onClick={() => handleLangChange('en')}>
                EN
              </button>
              <button type="button" className={lang === 'hi' ? 'active' : ''} onClick={() => handleLangChange('hi')}>
                हिं
              </button>
              <button type="button" className="lang-more" title="More languages coming soon">
                +
              </button>
            </div>
            <div className="user-menu-wrap">
              <button type="button" className="avatar-badge" onClick={() => setShowUserMenu((s) => !s)}>
                {(user?.name?.[0] || 'T').toUpperCase()}
              </button>
              {showUserMenu && (
                <div className="user-menu">
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserMenu(false)
                      setShowCalibration(true)
                    }}
                  >
                    {t.calibrateMenuItem}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserMenu(false)
                      handleLogout()
                    }}
                  >
                    {t.logout}
                  </button>
                </div>
              )}
            </div>
          </nav>

          <div className={`board-main dock-${panelDock}`}>
            <div className="board-canvas-area">
              <EquationCanvas onRecognized={handleRecognized} t={t} />
            </div>
            <div className="ai-panel">
              <div className="ai-panel-header">
                <span className="tag tag-accent">{t.aiOutput}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  onClick={togglePanelDock}
                  title={panelDock === 'side' ? t.dockToBottom : t.dockToSide}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="1" />
                    <path d="M9 3v18" />
                  </svg>
                </button>
              </div>
              <CommandDrafts
                commands={commands}
                onLatexAccept={handleConfirm}
                onSolveEquationAccept={handleSolveEquationConfirm}
                onView3d={handleView3d}
                t={t}
              />
              <SolveView latex={confirmedLatex} autoSolve={autoSolve} t={t} />
              <GraphView latex={confirmedLatex} t={t} onView3d={handleView3d} />
            </div>
          </div>
        </>
      )}
      {showCalibration && <CalibrationFlow onDone={handleCalibrationDone} onSkip={handleCalibrationSkip} t={t} />}
    </div>
  )
}
