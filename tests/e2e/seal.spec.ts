import { expect, test, type Page } from '@playwright/test'

const editor = (page: Page) => page.getByRole('textbox', { name: /Paste or type Markdown/ })
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Document sealed' })

test('sealing shows the link, what was done and a QR code', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await editor(page).fill('# Notes')
  await page.getByRole('button', { name: 'Seal link' }).click()
  await expect(dialog(page)).toBeVisible()
  const url = await dialog(page).getByTestId('share-url').inputValue()
  expect(url).toMatch(/#\/e\//)
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url)
  await expect(dialog(page)).toContainText('AES-256')
  await expect(dialog(page)).toContainText('In the link')
  await expect(dialog(page)).not.toContainText('another channel')
  await dialog(page).getByRole('button', { name: 'QR code' }).click()
  await expect(dialog(page).getByRole('img', { name: 'QR code for the link' })).toBeVisible()
})

test('a protected seal reminds to send the password separately', async ({ page }) => {
  await page.goto('/')
  await editor(page).fill('# Notes')
  await page.getByLabel('Password', { exact: true }).fill('s3cret')
  await page.getByRole('button', { name: 'Seal link' }).click()
  await expect(dialog(page)).toContainText('Password protected')
  await expect(dialog(page)).toContainText('Send the password through another channel')
})

test('the close button closes the dialog', async ({ page }) => {
  await page.goto('/')
  await editor(page).fill('# Notes')
  await page.getByRole('button', { name: 'Seal link' }).click()
  await dialog(page).getByRole('button', { name: 'Close' }).click()
  await expect(dialog(page)).toHaveCount(0)
})
