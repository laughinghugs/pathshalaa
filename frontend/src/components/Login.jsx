import { useEffect, useRef, useState } from 'react'
import { loginWithGoogle } from '../api/client'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

const LANG_KEY = 'pathshalaa_login_lang'

const COPY = {
  en: {
    welcome: 'Welcome, teacher',
    tagline: 'Turn handwritten equations into instant lessons for your class.',
    footer: 'Free for teachers and classrooms.',
    notConfigured: 'Google sign-in is not configured (missing VITE_GOOGLE_CLIENT_ID).',
    signinFailed: 'Sign-in failed. Please try again.',
  },
  hi: {
    welcome: 'स्वागत है, शिक्षक',
    tagline: 'हाथ से लिखे समीकरणों को अपनी कक्षा के लिए तुरंत पाठ में बदलें।',
    footer: 'शिक्षकों और कक्षाओं के लिए निःशुल्क।',
    notConfigured: 'Google साइन-इन कॉन्फ़िगर नहीं है (VITE_GOOGLE_CLIENT_ID गायब है)।',
    signinFailed: 'साइन-इन विफल रहा। कृपया पुनः प्रयास करें।',
  },
}

export default function Login({ onLoggedIn }) {
  const buttonRef = useRef(null)
  const [error, setError] = useState('')
  const [lang, setLang] = useState(() => localStorage.getItem(LANG_KEY) || 'en')
  const t = COPY[lang]

  function handleLangChange(next) {
    setLang(next)
    localStorage.setItem(LANG_KEY, next)
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
        shape: 'pill',
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
      <div className="login-lang-switch">
        <button
          type="button"
          className={lang === 'en' ? 'active' : ''}
          onClick={() => handleLangChange('en')}
        >
          EN
        </button>
        <button
          type="button"
          className={lang === 'hi' ? 'active' : ''}
          onClick={() => handleLangChange('hi')}
        >
          हिं
        </button>
      </div>
      <div className="login-card">
        <div className="login-icon-badge">π</div>
        <h1>Pathshalaa</h1>
        <p className="login-welcome">{t.welcome}</p>
        <p className="login-tagline">{t.tagline}</p>
        <div ref={buttonRef} className="google-button" />
        {error && <p className="error">{error}</p>}
        <p className="login-footer">{t.footer}</p>
      </div>
    </div>
  )
}
