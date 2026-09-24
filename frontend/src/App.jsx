import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { canAccess } from './utils/rbac'
import AppShell from './layouts/AppShell'
import PublicShell from './layouts/PublicShell'
import Login from './pages/Login'
import { Skeleton } from './components/ui'

// Lazy-loaded Pages
const Landing = lazy(() => import('./pages/Landing'))
const PublicOverview = lazy(() => import('./pages/public/PublicOverview'))
const PublicProjects = lazy(() => import('./pages/public/PublicProjects'))
const PublicProjectDetail = lazy(() => import('./pages/public/PublicProjectDetail'))
const PublicMap = lazy(() => import('./pages/public/PublicMap'))
const PublicReports = lazy(() => import('./pages/public/PublicReports'))
const PublicMethodology = lazy(() => import('./pages/public/PublicMethodology'))

// Authenticated Console Pages
const CommandCenter = lazy(() => import('./pages/CommandCenter'))
const Projects = lazy(() => import('./pages/Projects'))
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'))
const MapView = lazy(() => import('./pages/MapView'))
const Alerts = lazy(() => import('./pages/Alerts'))
const DataQuality = lazy(() => import('./pages/DataQuality'))
const Models = lazy(() => import('./pages/Models'))
const InvestigationQueue = lazy(() => import('./pages/InvestigationQueue'))
const CaseList = lazy(() => import('./pages/CaseList'))
const CaseDetail = lazy(() => import('./pages/CaseDetail'))
const GeoTag1 = lazy(() => import('./pages/GeoTag1'))
const CitizenReports = lazy(() => import('./pages/CitizenReports'))

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-500 font-mono text-xs">
        Getting your workspace ready…
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return children
}

/* Role gate for console pages — mirrors ROUTE_ROLES so a role that
   can't see a nav item also can't deep-link to its page. */
function RoleRoute({ path, children }) {
  const { user } = useAuth()
  if (user && !canAccess(user.role, path)) return <Navigate to="/command-center" replace />
  return children
}

const PageFallback = () => (
  <div className="mx-auto max-w-7xl space-y-4 p-4">
    <Skeleton className="h-10 w-64" />
    <Skeleton className="h-48" />
    <Skeleton className="h-64" />
  </div>
)

export default function App() {
  return (
    <Routes>
      {/* ── 1. ENTRY & LANDING ──────────────────────────────────────── */}
      <Route path="/" element={<Suspense fallback={<PageFallback />}><Landing /></Suspense>} />

      {/* ── 2. PUBLIC TRANSPARENCY PORTAL (NO LOGIN REQUIRED) ────────── */}
      <Route path="/public" element={<PublicShell />}>
        <Route index element={<Navigate to="/public/overview" replace />} />
        <Route path="overview" element={<Suspense fallback={<PageFallback />}><PublicOverview /></Suspense>} />
        <Route path="projects" element={<Suspense fallback={<PageFallback />}><PublicProjects /></Suspense>} />
        <Route path="projects/:projectId" element={<Suspense fallback={<PageFallback />}><PublicProjectDetail /></Suspense>} />
        <Route path="map" element={<Suspense fallback={<PageFallback />}><PublicMap /></Suspense>} />
        <Route path="reports" element={<Suspense fallback={<PageFallback />}><PublicReports /></Suspense>} />
        <Route path="methodology" element={<Suspense fallback={<PageFallback />}><PublicMethodology /></Suspense>} />
        <Route path="notices" element={<Navigate to="/public/methodology" replace />} />
      </Route>

      {/* ── 3. OFFICIAL AUTHORIZED LOGIN ────────────────────────────── */}
      <Route path="/login" element={<Login />} />

      {/* ── 4. AUTHORIZED OFFICIAL CONSOLE (LOGIN REQUIRED) ─────────── */}
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/command-center" element={<Suspense fallback={<PageFallback />}><CommandCenter /></Suspense>} />
        <Route path="/projects" element={<Suspense fallback={<PageFallback />}><Projects /></Suspense>} />
        <Route path="/projects/:projectId" element={<Suspense fallback={<PageFallback />}><ProjectDetail /></Suspense>} />
        <Route path="/map" element={<Suspense fallback={<PageFallback />}><MapView /></Suspense>} />
        <Route path="/alerts" element={<RoleRoute path="/alerts"><Suspense fallback={<PageFallback />}><Alerts /></Suspense></RoleRoute>} />
        <Route path="/investigations/queue" element={<RoleRoute path="/investigations/queue"><Suspense fallback={<PageFallback />}><InvestigationQueue /></Suspense></RoleRoute>} />
        <Route path="/investigations" element={<RoleRoute path="/investigations"><Suspense fallback={<PageFallback />}><CaseList /></Suspense></RoleRoute>} />
        <Route path="/investigations/:investigationId" element={<RoleRoute path="/investigations"><Suspense fallback={<PageFallback />}><CaseDetail /></Suspense></RoleRoute>} />
        <Route path="/data-quality" element={<RoleRoute path="/data-quality"><Suspense fallback={<PageFallback />}><DataQuality /></Suspense></RoleRoute>} />
        <Route path="/models" element={<RoleRoute path="/models"><Suspense fallback={<PageFallback />}><Models /></Suspense></RoleRoute>} />
        <Route path="/geotag" element={<RoleRoute path="/geotag"><Suspense fallback={<PageFallback />}><GeoTag1 /></Suspense></RoleRoute>} />
        <Route path="/citizen-reports" element={<RoleRoute path="/citizen-reports"><Suspense fallback={<PageFallback />}><CitizenReports /></Suspense></RoleRoute>} />
      </Route>

      {/* Fallback Catch-all Route */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
