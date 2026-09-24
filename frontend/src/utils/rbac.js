/* Single source of truth for which console features each role can open.
   Mirrors the server: /models requires ministry|officer, /investigations/queue
   requires ministry|officer|state. Everything else is scope-filtered
   server-side, so "Limited" access (e.g. a District Collector's alerts)
   is simply the same page over district-scoped data.

   null = any authenticated console role. */
export const ROUTE_ROLES = {
  '/command-center': null,
  '/projects': null,
  '/map': null,
  '/alerts': ['ministry', 'officer', 'state', 'district'],
  '/investigations/queue': ['ministry', 'officer', 'state'],
  '/investigations': ['ministry', 'officer', 'state', 'district'],
  '/data-quality': ['ministry', 'officer', 'state', 'district'],
  '/geotag': ['ministry', 'officer', 'state', 'district'],
  '/citizen-reports': ['ministry', 'officer', 'state', 'district'],
  // Model governance is an internal technical/admin function. Everyone else
  // consumes model OUTPUTS (risk scores, alert explanations) in context.
  '/models': ['ministry'],
}

export const canAccess = (role, path) => {
  const allowed = ROUTE_ROLES[path]
  return !allowed || allowed.includes(role)
}

/* "Show the permission level, don't just hide": short access-depth notes
   rendered under nav items, so the RBAC model is visible to the user.
   Only depth-limited combinations get a note — full access needs none. */
const ACCESS_NOTES = {
  '/alerts': {
    district: 'District scope',
    state: 'State scope',
    officer: 'Review & investigate',
  },
  '/investigations/queue': {
    state: 'State scope',
    officer: 'Assigned / authorized',
  },
  '/investigations': {
    district: 'District scope',
    state: 'State scope',
    officer: 'Assigned + monitoring',
  },
  '/data-quality': {
    district: 'District focus',
    state: 'State focus',
    officer: 'Review data reliability',
  },
}

export const accessNote = (role, path) => ACCESS_NOTES[path]?.[role] ?? null

/* Human-readable scope chip per role — the console shows users the slice
   of data they are looking at, not a hardcoded "NATIONAL". */
export const SCOPE_BADGES = {
  ministry: 'NATIONAL · HQ',
  officer: 'NATIONAL',
  state: 'STATE SCOPE',
  district: 'DISTRICT SCOPE',
  mp: 'CONSTITUENCY',
  viewer: 'READ-ONLY',
}
