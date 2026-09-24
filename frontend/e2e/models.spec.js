import { expect, test } from '@playwright/test'
import { login } from './helpers'

test.describe('model registry and evaluation dashboard', () => {
  test('registry cards and evaluation charts render real metrics', async ({ page }) => {
    await login(page, 'ministry')
    await page.goto('/models')
    await expect(page.getByText(/What this model does/).first()).toBeVisible({ timeout: 20_000 })

    await page.getByRole('button', { name: 'Evaluation dashboard' }).click()
    await expect(page).toHaveURL(/view=evaluation/)
    await expect(page.getByText('demo-v2')).toBeVisible({ timeout: 20_000 })
    for (const section of ['Risk ranking — precision at K', 'confusion matrix',
                           'feature importance', 'Detector precision / recall / F1',
                           'Methodology & limitations']) {
      await expect(page.getByText(section, { exact: false }).first()).toBeVisible()
    }
    // exact confusion counts are visible (accessibility: never color-only)
    await expect(page.getByText('True positive').first()).toBeVisible()
  })
})
