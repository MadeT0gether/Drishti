import { expect, test } from '@playwright/test'
import { login } from './helpers'

test.describe('choropleth map', () => {
  test('renders real district polygons with attribution and modes', async ({ page }) => {
    await login(page, 'ministry')
    await page.goto('/map')
    // 80 boundary polygons
    await expect(page.locator('path.leaflet-interactive')).toHaveCount(80, { timeout: 30_000 })
    await expect(page.getByText(/DataMeet/).first()).toBeVisible()

    // switch to Health mode — URL updates and legend swaps
    await page.getByRole('button', { name: 'Health', exact: true }).click()
    await expect(page).toHaveURL(/mode=health/)
    await expect(page.getByText('● Steady')).toBeVisible()
  })

  test('district selection cross-filters into projects and queue', async ({ page }) => {
    await login(page, 'ministry')
    await page.goto('/map?district_id=1')
    // project-points mode + side panel with cross-filter links
    await expect(page.getByRole('link', { name: 'View projects' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Active investigations')).toBeVisible()
    // the side-panel link (not the sidebar nav entry of the same name)
    await page.locator('a[href*="/investigations/queue?district_id="]').click()
    await expect(page).toHaveURL(/investigations\/queue\?district_id=1/)
    await expect(page.getByRole('button', { name: /District filter active/ })).toBeVisible()
    // the scoped queue lists only Pune projects
    await expect(page.locator('tbody tr').first()).toContainText('Pune')
  })
})
