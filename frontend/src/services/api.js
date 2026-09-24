import axios from 'axios'

const TOKEN_KEY = 'mplads_token'

export const getToken = () => sessionStorage.getItem(TOKEN_KEY)
export const setToken = (token) => sessionStorage.setItem(TOKEN_KEY, token)
export const clearToken = () => sessionStorage.removeItem(TOKEN_KEY)

export const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api/v1',
})

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// On 401, drop the stale token; the router guard redirects to /login.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      clearToken()
      window.dispatchEvent(new Event('mplads:unauthorized'))
    }
    return Promise.reject(error)
  }
)

const get = (url, params) => api.get(url, { params }).then((r) => r.data)

export const authApi = {
  login: (email, password) => api.post('/auth/login', { email, password }).then((r) => r.data),
  me: () => get('/auth/me'),
}

export const projectsApi = {
  list: (params) => get('/projects', params),
  categories: () => get('/projects/categories'),
  agencies: () => get('/projects/agencies'),
  detail: (id) => get(`/projects/${id}`),
  risk: (id) => get(`/projects/${id}/risk`),
  riskTimeline: (id) => get(`/projects/${id}/risk/timeline`),
  anomalies: (id) => get(`/projects/${id}/anomalies`),
  similar: (id) => get(`/projects/${id}/similar`),
  relationships: (id) => get(`/projects/${id}/relationships`),
  reconciliation: (id) => get(`/projects/${id}/reconciliation`),
  predictions: (id) => get(`/projects/${id}/predictions`),
  earlyWarning: (id) => get(`/projects/${id}/early-warning`),
}

export const dashboardApi = {
  overview: () => get('/dashboard/overview'),
  states: () => get('/dashboard/states'),
  districts: (params) => get('/dashboard/districts', params),
  health: (params) => get('/dashboard/health', params),
  map: (params) => get('/dashboard/map', params),
  mapBoundaries: (params) => get('/dashboard/map/boundaries', params),
  executiveSummary: () => get('/dashboard/executive-summary'),
  exportCsv: () =>
    api.get('/dashboard/export.csv', { responseType: 'blob' }).then((r) => r.data),
  exportPdf: () =>
    api.get('/dashboard/executive-summary.pdf', { responseType: 'blob' }).then((r) => r.data),
  monthlyReportMonths: () => get('/dashboard/monthly-report/months'),
  monthlyReportPdf: (year, month) =>
    api.get('/dashboard/monthly-report.pdf', {
      params: { year, month },
      responseType: 'blob',
    }).then((r) => r.data),
  quarterlyReportQuarters: () => get('/dashboard/quarterly-report/quarters'),
  quarterlyReportPdf: (year, quarter) =>
    api.get('/dashboard/quarterly-report.pdf', {
      params: { year, quarter },
      responseType: 'blob',
    }).then((r) => r.data),
  stateReportPdf: (stateId, year, month) =>
    api.get('/dashboard/state-report.pdf', {
      params: { state_id: stateId, year, month },
      responseType: 'blob',
    }).then((r) => r.data),
  annualReportYears: () => get('/dashboard/annual-report/years'),
  annualReportPdf: (year) =>
    api.get('/dashboard/annual-report.pdf', {
      params: { year },
      responseType: 'blob',
    }).then((r) => r.data),
}

export const alertsApi = {
  list: (params) => get('/alerts', params),
  stats: () => get('/alerts/stats'),
  rules: () => get('/alerts/rules'),
  detail: (id) => get(`/alerts/${id}`),
}

export const dataApi = {
  quality: () => get('/data/quality'),
  // Public-safe transparency exports; blob so the browser can save the file.
  exportDataset: (dataset) =>
    api.get(`/data/export/${dataset}`, { responseType: 'blob' }).then((r) => r.data),
}

export const investigationsApi = {
  queue: (params) => get('/investigations/queue', params),
  list: (params) => get('/investigations', params),
  detail: (id) => get(`/investigations/${id}`),
  actions: (id, params) => get(`/investigations/${id}/actions`, params),
  playbooks: () => get('/investigations/playbooks'),
  open: (body) => api.post('/investigations', body).then((r) => r.data),
  addAction: (id, body) => api.post(`/investigations/${id}/actions`, body).then((r) => r.data),
  transition: (id, body) => api.post(`/investigations/${id}/transition`, body).then((r) => r.data),
  assign: (id, body) => api.post(`/investigations/${id}/assign`, body).then((r) => r.data),
  assignees: (id) => get(`/investigations/${id}/assignees`),
  updateSummary: (id, body) => api.patch(`/investigations/${id}`, body).then((r) => r.data),
  exportReport: (id) =>
    api.get(`/investigations/${id}/report.pdf`, { responseType: 'blob' }).then((r) => r.data),
  exportReportXlsx: (id) =>
    api.get(`/investigations/${id}/report.xlsx`, { responseType: 'blob' }).then((r) => r.data),
}

export const copilotApi = {
  status: () => get('/copilot/status'),
  ask: (id, question) => api.post(`/investigations/${id}/copilot/ask`, { question }).then((r) => r.data),
  summary: (id) => api.post(`/investigations/${id}/copilot/summary`).then((r) => r.data),
}

export const modelsApi = {
  list: () => get('/models'),
  detail: (name) => get(`/models/${name}`),
  evaluation: () => get('/models/evaluation'),
  riskSimulation: () => get('/models/risk/simulation'),
}

export const geotagApi = {
  // Upload configuration (file size limits, accepted formats)
  config: () => get('/geotag/config'),
  // Search projects by ID, code or Name for evidence association
  searchProjects: (q) => get('/geotag/projects/search', { q }),
  // Upload an image; formData can include 'file', 'project_id', and 'officer_review'
  upload: (formData) =>
    api.post('/geotag/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data),
  // Update officer review observation text and/or review status
  updateReview: (id, payload) => api.patch(`/geotag/${id}/review`, payload).then((r) => r.data),
  // List evidence records (paginated)
  list: (params) => get('/geotag', params),
  // Single evidence detail
  detail: (id) => get(`/geotag/${id}`),
  // Full EXIF/GPS metadata for an evidence record
  metadata: (id) => get(`/geotag/${id}/metadata`),
  // Returns the URL for the PDF (served by backend) — use in <a href> or fetch
  pdfDownloadUrl: (id) =>
    `${(import.meta.env.VITE_API_URL || 'http://localhost:8000')}/api/v1/geotag/${id}/pdf`,
}

export const citizenReportsApi = {
  // Public report submission
  submit: (data) => api.post('/citizen-reports', data).then((r) => r.data),
  // Upload photo with EXIF detection
  uploadPhoto: (formData) =>
    api.post('/citizen-reports/upload-photo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data),
  // Track report by Reference ID (public)
  track: (referenceId) => get(`/citizen-reports/track/${referenceId}`),
  // Authorized government listing
  list: (params) => get('/citizen-reports', params),
  // Authorized government detail
  detail: (id) => get(`/citizen-reports/${id}`),
  // Update review status, assign officer, remarks
  update: (id, data) => api.patch(`/citizen-reports/${id}`, data).then((r) => r.data),
}
