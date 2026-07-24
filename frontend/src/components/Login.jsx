import { useEffect, useRef, useState } from 'react'
import { loginWithGoogle } from '../api/client'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

export default function Login({ onLoggedIn }) {
  const buttonRef = useRef(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      setError('Google sign-in is not configured (missing VITE_GOOGLE_CLIENT_ID).')
      return
    }

    let cancelled = false

    async function handleCredentialResponse(response) {
      setError('')
      try {
        await loginWithGoogle(response.credential)
        onLoggedIn()
      } catch {
        setError('Sign-in failed. Please try again.')
      }
    }

    function renderButton() {
      if (cancelled || !buttonRef.current) return
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
      })
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        width: 280,
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
  }, [])

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>Pathshalaa</h1>
        <p>Sign in with your Google account to continue</p>
        <div ref={buttonRef} className="google-button" />
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  )
}
