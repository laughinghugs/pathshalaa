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

export async function getGraphData(latex) {
  const { data } = await client.post('/graph', { latex })
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

export default client
