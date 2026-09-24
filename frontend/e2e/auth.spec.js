import { expect, test } from '@playwright/test'
import { PW, USERS, blockTiles, login } from './helpers'

test.describe('authentication', () => {
  test('unauthenticated visit redirects to login', async ({ page }) => {
    await blockTiles(page)
    await page.goto('/projects')
    await expect(page).toHaveURL(/login/)
  })

  test('wrong password is rejected with a message', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('official@example.gov.in').fill(USERS.ministry)
    await page.getByLabel('Password').fill('wrong-password')
    await page.getByRole('button', { name: 'Internal Login' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page).toHaveURL(/login/)
  })

  test('login and logout round-trip', async ({ page }) => {
    await login(page, 'ministry')
    await expect(page.getByRole('link', { name: 'Command Center' })).toBeVisible()
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/login/)
    // the session is really gone
    await page.goto('/projects')
    await expect(page).toHaveURL(/login/)
  })
})
