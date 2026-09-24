import { expect, test } from '@playwright/test'
import { login } from './helpers'

test.describe('projects list and detail', () => {
  test('search, filter, paginate', async ({ page }) => {
    await login(page, 'ministry')
    await page.goto('/projects')
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 })

    // filter by risk level narrows results and reflects in the URL
    // (combobox role disambiguates the select from RiskBadge status labels)
    await page.getByRole('combobox', { name: /risk level/i }).selectOption('critical')
    await expect(page).toHaveURL(/risk_level=critical/)
    await expect(page.locator('tbody tr').first()).toBeVisible()

    // pagination
    await page.getByRole('combobox', { name: /risk level/i }).selectOption('')
    await page.getByRole('button', { name: 'Next' }).first().click()
    await expect(page).toHaveURL(/page=2/)

    // search
    await page.goto('/projects?search=community%20hall')
    await expect(page.locator('tbody tr').first()).toBeVisible()
  })

  test('project detail shows risk card, evidence and predictions', async ({ page }) => {
    await login(page, 'ministry')
    // deterministic high-risk demo project (top of the queue)
    await page.goto('/investigations/queue')
    const firstProject = page.locator('tbody tr a').first()
    await firstProject.click()
    await expect(page).toHaveURL(/\/projects\/\d+/)
    await expect(page.getByText(/Implementation \/ Review Risk|Risk level/i).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Evidence' })).toBeVisible()
    await expect(page.getByText(/decision-support/i).first()).toBeVisible()
  })
})
