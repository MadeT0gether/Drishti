// M07 E2E configuration.
//
// Prerequisites (same as the backend pytest suite): Docker Postgres on :5434
// with the demo-v2 dataset, pipeline outputs and seeded demo users. The
// backend server is started (or reused if already running) on :8000; the
// frontend is served as a PRODUCTION build via `vite preview` on :4173.
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, // specs share one dev database — keep runs deterministic
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    contextOptions: { reducedMotion: 'reduce' },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Windows path (this project's dev environment); on other platforms
      // start the backend yourself — reuseExistingServer picks it up.
      command:
        '..\\backend\\.venv\\Scripts\\python.exe -m uvicorn app.main:app --app-dir ..\\backend --port 8000',
      url: 'http://127.0.0.1:8000/health',  // uvicorn binds IPv4; avoid ::1 lookup
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run build && npm run preview -- --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
})
