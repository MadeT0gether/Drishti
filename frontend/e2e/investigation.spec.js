import { expect, test } from '@playwright/test'
import { apiToken, dismissCase, login } from './helpers'

// Full human-in-the-loop journey. The case is driven to a terminal state at
// the end (and in afterEach on failure) so reruns stay clean.
test.describe('investigation lifecycle', () => {
  let caseId = null

  test.afterEach(async ({ request }) => {
    if (caseId) {
      const token = await apiToken(request, 'ministry')
      await dismissCase(request, token, caseId)
      caseId = null
    }
  })

  test('queue -> open -> assign -> playbook -> copilot -> report -> close -> audit', async ({ page }) => {
    // triple timeout: the first Copilot query loads the sentence-transformer
    // model server-side, which can take >10s under full-suite load
    test.slow()
    await login(page, 'officer')

    // 1. open a case from the smart queue
    await page.goto('/investigations/queue?has_open_case=false')
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: 'Open case' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Open investigation case' })
    await dialog.locator('textarea').fill('E2E: high-priority queue item selected for review.')
    await dialog.getByRole('button', { name: 'Open case' }).click()
    await page.waitForURL(/\/investigations\/\d+/)
    caseId = Number(page.url().match(/investigations\/(\d+)/)[1])
    await expect(page.locator('h1')).toContainText('INV-')

    // 2. assign to myself
    await page.getByRole('button', { name: 'Assign to me' }).click()
    await expect(page.getByText('officer@mplads.demo').first()).toBeVisible()

    // 3. complete a playbook step (reason required)
    await page.getByRole('button', { name: 'Mark complete' }).first().click()
    const stepDialog = page.getByRole('dialog')
    await stepDialog.locator('textarea').fill('E2E: verified this step against records.')
    await stepDialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Completed', { exact: true }).first()).toBeVisible()

    // 4. ask the Copilot via a quick prompt — grounded answer with citations.
    // The badge only renders WITH the answer, so the long (model-warmup)
    // timeout belongs on this first assertion.
    await page.getByRole('button', { name: 'Why is this project risky?' }).click()
    await expect(page.getByText(/AI Copilot/).first()).toBeVisible({ timeout: 90_000 })
    await expect(page.getByText(/risk indicators|risk \(score/i).first())
      .toBeVisible({ timeout: 90_000 })
    await expect(page.getByText(/Evidence: .*risk_/).first()).toBeVisible()
    await expect(page.getByText(/decision-support/i).first()).toBeVisible()

    // 5. export the PDF package
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /Export package/ }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^INV-.*\.pdf$/)

    // 6. move through the state machine and close with an outcome
    await page.getByRole('button', { name: 'Change status' }).click()
    let tDialog = page.getByRole('dialog', { name: 'Change case status' })
    await tDialog.getByLabel(/New status/).selectOption('in_progress')
    await tDialog.locator('textarea').first().fill('E2E: starting the review of evidence.')
    await tDialog.getByRole('button', { name: 'Confirm' }).click()
    await expect(page.getByText('In Progress').first()).toBeVisible()

    await page.getByRole('button', { name: 'Change status' }).click()
    tDialog = page.getByRole('dialog', { name: 'Change case status' })
    await tDialog.getByLabel(/New status/).selectOption('closed')
    await tDialog.locator('textarea').first().fill('E2E: review complete, all items explained.')
    await tDialog.getByLabel(/Outcome \(required/).selectOption('no_issue_found')
    await tDialog.locator('textarea').nth(1).fill('E2E: flagged indicators explained by verified records.')
    await tDialog.getByRole('button', { name: 'Confirm' }).click()
    await expect(page.getByText('Outcome: No issue found').first()).toBeVisible()

    // 7. the append-only timeline recorded the journey
    const timeline = page.getByText(/Action timeline/)
    await expect(timeline).toBeVisible()
    for (const event of ['Case opened', 'Assigned', 'Playbook step completed',
                         'Copilot consulted', 'Outcome recorded']) {
      await expect(page.getByText(event, { exact: true }).first()).toBeVisible()
    }
    caseId = null // closed = terminal; no cleanup needed
  })
})
