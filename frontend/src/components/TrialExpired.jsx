import Corners from './Corners'

const CONTACT_EMAIL = 'hello@pathshalaa.app'

export default function TrialExpired({ message, onLogout, t }) {
  return (
    <div className="login-screen">
      <div className="login-card blueprint elev-lg">
        <Corners />
        <div className="login-icon-badge">⏳</div>
        <h1>{t.trialExpiredTitle}</h1>
        <p className="login-tagline">{message || t.trialExpiredFallback}</p>
        <a className="btn btn-primary btn-block" href={`mailto:${CONTACT_EMAIL}`}>
          {t.trialExpiredContact}
        </a>
        <button type="button" className="btn btn-ghost btn-block" onClick={onLogout}>
          {t.trialExpiredLogout}
        </button>
      </div>
    </div>
  )
}
