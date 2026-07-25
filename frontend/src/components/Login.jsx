import { useEffect, useRef, useState } from 'react'
import { loginWithGoogle } from '../api/client'
import { COPY, getLang, setLang as persistLang } from '../i18n'
import Corners from './Corners'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

export default function Login({ onLoggedIn }) {
  const buttonRef = useRef(null)
  const [error, setError] = useState('')
  const [lang, setLang] = useState(getLang)
  const t = COPY[lang]

  function handleLangChange(next) {
    setLang(next)
    persistLang(next)
  }

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      setError(t.notConfigured)
      return
    }

    let cancelled = false

    async function handleCredentialResponse(response) {
      setError('')
      try {
        await loginWithGoogle(response.credential)
        onLoggedIn()
      } catch {
        setError(t.signinFailed)
      }
    }

    function renderButton() {
      if (cancelled || !buttonRef.current) return
      buttonRef.current.innerHTML = ''
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
      })
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'filled_blue',
        size: 'large',
        shape: 'rectangular',
        text: 'signin_with',
        logo_alignment: 'left',
        width: 300,
      })
    }

    // The Google Identity Services script tag loads asynchronously, so it
    // may not be ready yet when this component first mounts.
    if (window.google?.accounts?.id) {
      renderButton()
      return
    }

    const interval = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(interval)
        renderButton()
      }
    }, 100)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [lang])

  return (
    <div className="login-screen">
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
      <div className="login-card blueprint elev-lg">
        <Corners />
        <div className="login-icon-badge">π</div>
        <h1>{t.brand}</h1>
        <p className="login-welcome">{t.loginWelcome}</p>
        <p className="login-tagline">{t.loginTagline}</p>
        <div ref={buttonRef} className="google-button" />
        {error && <p className="error">{error}</p>}
        <p className="login-footer">{t.loginFooter}</p>
      </div>
    </div>
  )
}
