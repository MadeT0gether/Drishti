// Shared E2E helpers. Demo users are the seeded synthetic-prototype accounts.
export const PW = 'Demo@1234'

export const USERS = {
  ministry: 'ministry@mplads.demo',
  state: 'state.mh@mplads.demo',
  district: 'district.pune@mplads.demo',
  officer: 'officer@mplads.demo',
}

/** Block OSM tile fetches — map assertions target our layers, never tiles. */
export async function blockTiles(page) {
  await page.route('**/tile.openstreetmap.org/**', (route) => route.abort())
}

export async function login(page, role = 'ministry') {
  await blockTiles(page)
  await page.goto('/login')
  await page.getByPlaceholder('official@example.gov.in').fill(USERS[role])
  await page.getByLabel('Password').fill(PW)
  await page.getByRole('button', { name: 'Internal Login' }).click()
  await page.waitForURL((url) => !url.pathname.includes('login'))
}

/** API-level cleanup: drive a case to a terminal state so reruns stay clean. */
export async function dismissCase(request, token, caseId) {
  await request.post(`http://localhost:8000/api/v1/investigations/${caseId}/transition`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      to_status: 'dismissed',
      reason: 'Automated E2E cleanup dismissal.',
      outcome: 'inconclusive',
      outcome_note: 'E2E test case only.',
    },
  })
}

export async function apiToken(request, role = 'ministry') {
  const res = await request.post('http://localhost:8000/api/v1/auth/login', {
    data: { email: USERS[role], password: PW },
  })
  return (await res.json()).access_token
}
