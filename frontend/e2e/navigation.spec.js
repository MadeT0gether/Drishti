import { expect, test } from '@playwright/test'
import { login } from './helpers'

test.describe('command center and navigation', () => {
  test('command center loads real KPIs', async ({ page }) => {
    await login(page, 'ministry')
    await page.goto('/')
    // KPI numbers come from the API — assert presence of populated stat values
    await expect(page.getByText(/Total Projects/i).first()).toBeVisible()
    await expect(page.getByText(/25,\d{3}/).first()).toBeVisible({ timeout: 20_000 })
  })

  test('every page is reachable from the sidebar', async ({ page }) => {
    await login(page, 'ministry')
    const routes = [
      ['Projects', /\/projects/],
      ['Risk & Alerts', /\/alerts/],
      ['Investigation Queue', /\/investigations\/queue/],
      ['Cases', /\/investigations$/],
      ['Geographic View', /\/map/],
      ['Data Quality', /\/data-quality/],
      ['AI & Models', /\/models/],
    ]
    for (const [label, urlPattern] of routes) {
      await page.getByRole('link', { name: label, exact: true }).click()
      await expect(page).toHaveURL(urlPattern)
      await expect(page.locator('h1')).toBeVisible()
    }
  })
})
