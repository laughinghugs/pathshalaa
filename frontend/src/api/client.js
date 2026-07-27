import axios from 'axios'

const TOKEN_KEY = 'pathshalaa_token'
const USER_KEY = 'pathshalaa_user'

// Defaults to a same-origin relative path, which only works when something
// (Vite's dev proxy locally, or a reverse proxy in production) forwards
// /api/* to the backend from the same origin the frontend is served from.
// If the backend lives on a different origin, set VITE_API_BASE_URL to its
// full URL (e.g. "https://api.example.com/api").
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

const client = axios.create({
  baseURL: API_BASE_URL,
})

client.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// The backend 403s with this structured body (see app/billing/trial.py)
// when a demo trial has lapsed. Rather than every call site checking for
// it, listeners registered via onTrialExpired are notified centrally so
// the app can swap in a dedicated "trial expired" screen.
const trialExpiredListeners = new Set()

export function onTrialExpired(listener) {
  trialExpiredListeners.add(listener)
  return () => trialExpiredListeners.delete(listener)
}

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 403 && error.response?.data?.detail?.error === 'trial_expired') {
      const message = error.response.data.detail.message
      trialExpiredListeners.forEach((listener) => listener(message))
    }
    return Promise.reject(error)
  }
)

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export function getUser() {
  const raw = localStorage.getItem(USER_KEY)
  return raw ? JSON.parse(raw) : null
}

function setUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

function clearUser() {
  localStorage.removeItem(USER_KEY)
}

export async function loginWithGoogle(idToken) {
  const { data } = await client.post('/auth/google', { id_token: idToken })
  setToken(data.token)
  setUser({ name: data.name, email: data.email })
  return data
}

export function logout() {
  clearToken()
  clearUser()
}

export async function getMe() {
  const { data } = await client.get('/auth/me')
  return data
}

export async function getGraphData(latex) {
  const { data } = await client.post('/graph', { latex })
  return data
}

// `range`, when given, is { min, max, minInclusive?, maxInclusive? } — min/max
// as plain number strings ("6.283") or LaTeX expressions ("\\pi", "2\\pi");
// see solving.py's _parse_range_bound, which accepts either.
export async function solveEquation(latex, range) {
  const payload = { latex }
  if (range?.min != null && range?.max != null && range.min !== '' && range.max !== '') {
    payload.range_min = String(range.min)
    payload.range_max = String(range.max)
    if (range.minInclusive != null) payload.range_min_inclusive = range.minInclusive
    if (range.maxInclusive != null) payload.range_max_inclusive = range.maxInclusive
  }
  const { data } = await client.post('/solve', payload)
  return data
}

export async function calculateMensuration(shape, dimensions, unit) {
  const { data } = await client.post('/mensuration/calculate', { shape, dimensions, unit: unit || null })
  return data
}

export async function recognizeEquation(blob) {
  const formData = new FormData()
  formData.append('image', blob, 'equation.png')
  const { data } = await client.post('/recognize', formData)
  return data.commands
}

export async function getCalibrationStatus() {
  const { data } = await client.get('/calibration/status')
  return data.sample_count
}

export async function submitCalibrationSample(blob, label) {
  const formData = new FormData()
  formData.append('image', blob, 'sample.png')
  formData.append('label', label)
  await client.post('/calibration/samples', formData)
}

export async function submitCorrection(blob, correctedLabel) {
  const formData = new FormData()
  formData.append('image', blob, 'equation.png')
  formData.append('corrected_label', correctedLabel)
  await client.post('/calibration/corrections', formData)
}

// Owner-only. The backend restricts these to the "owner" role regardless
// of what the frontend does — this is UI convenience, not the access
// control (see require_permission("manage_all_users") in admin_router.py).
export async function listAllUsers() {
  const { data } = await client.get('/admin/users')
  return data
}

export async function listAllOrganisations() {
  const { data } = await client.get('/admin/organisations')
  return data
}

export async function createOrganisation(payload) {
  const { data } = await client.post('/admin/organisations', payload)
  return data
}

export async function assignUserToOrganisation(userId, targetOrganisationId) {
  const { data } = await client.post('/admin/upgrade-user', {
    user_id: userId,
    target_organisation_id: targetOrganisationId,
  })
  return data
}

export async function changeUserRole(userId, role) {
  const { data } = await client.post('/admin/change-role', { user_id: userId, role })
  return data
}

export async function listAllInvites() {
  const { data } = await client.get('/admin/invites')
  return data
}

export async function createInvite(email, role, organisationId) {
  const { data } = await client.post('/admin/invites', {
    email,
    role,
    organisation_id: organisationId,
  })
  return data
}

export async function deleteInvite(inviteId) {
  await client.delete(`/admin/invites/${inviteId}`)
}

export default client
