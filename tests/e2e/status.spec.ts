import { expect, test, type Page } from '@playwright/test'

const editor = (page: Page) => page.getByRole('textbox', { name: /Paste or type Markdown/ })
const status = (page: Page) => page.getByRole('group', { name: 'Document status' })

test('the status bar counts the document and confirms the save', async ({ page }) => {
  await page.goto('/')
  await editor(page).fill('one two three\nfour')
  await expect(status(page)).toContainText('4 words')
  await expect(status(page)).toContainText('18 characters')
  await expect(status(page)).toContainText('2 lines')
  await expect(status(page)).toContainText('1 min read')
  await expect(status(page)).toContainText('Saved on this device')
})

test('the sync scroll toggle shows in split mode and is remembered', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await page.getByRole('tab', { name: 'Write' }).click()
  await expect(page.getByRole('button', { name: 'Sync scroll' })).toHaveCount(0)
  await page.getByRole('tab', { name: 'Split' }).click()
  const toggle = page.getByRole('button', { name: 'Sync scroll' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Sync scroll' })).toHaveAttribute('aria-pressed', 'false')
})

test('the sync scroll toggle is vertically aligned with the status text', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await page.getByRole('tab', { name: 'Split' }).click()
  const toggle = (await page.getByRole('button', { name: 'Sync scroll' }).boundingBox())!
  const words = (await status(page).getByText(/\d+ words?/).boundingBox())!
  expect(Math.abs(toggle.y + toggle.height / 2 - (words.y + words.height / 2))).toBeLessThanOrEqual(2)
})
