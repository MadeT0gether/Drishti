import { expect, test } from '@playwright/test'
import { login } from './helpers'

test.describe('RBAC in the UI (server remains authoritative)', () => {
  test('viewer is read-only', async ({ page }) => {
    await login(page, 'viewer')
    // Data Quality hidden from the nav
    await expect(page.getByRole('link', { name: 'Data Quality' })).toHaveCount(0)
    // queue renders but without any Open case action
    await page.goto('/investigations/queue')
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Open case' })).toHaveCount(0)
  })

  test('district user sees only their district', async ({ page }) => {
    await login(page, 'district')
    await page.goto('/investigations/queue')
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 })
    const rows = page.locator('tbody tr')
    const n = await rows.count()
    for (let i = 0; i < Math.min(n, 10); i++) {
      await expect(rows.nth(i)).toContainText('Pune')
    }
  })

  test('ministry has the full national picture', async ({ page }) => {
    await login(page, 'ministry')
    await page.goto('/map')
    await expect(page.locator('path.leaflet-interactive')).toHaveCount(80, { timeout: 30_000 })
  })
})
