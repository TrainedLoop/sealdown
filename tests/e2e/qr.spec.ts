import { expect, test, type Page } from '@playwright/test'

const editor = (page: Page) => page.getByRole('textbox', { name: /Paste or type Markdown/ })

test('shows a QR code for a short link', async ({ page }) => {
  await page.goto('/')
  await editor(page).fill('# Scan me')
  await page.getByRole('button', { name: 'Seal link' }).click()
  await page.getByRole('button', { name: 'QR code' }).click()
  const img = page.getByRole('img', { name: 'QR code for the link' })
  await expect(img).toBeVisible()
  expect(await img.getAttribute('src')).toMatch(/^data:image\/png;base64,/)
  const size = await img.evaluate((el: HTMLImageElement) => el.naturalWidth)
  expect(size).toBeGreaterThan(100)
})

test('explains when a link is too long for a QR code', async ({ page }) => {
  await page.goto('/')
  // Storage is unavailable in this build, so a large document gets a long inline link.
  const words = Array.from({ length: 3000 }, () => Math.random().toString(36).slice(2, 9)).join(' ')
  await editor(page).fill(words)
  await page.getByRole('button', { name: 'Seal link' }).click()
  await page.getByRole('button', { name: 'QR code' }).click()
  await expect(page.getByText('This link is too long for a QR code.')).toBeVisible()
  await expect(page.getByRole('img', { name: 'QR code for the link' })).toHaveCount(0)
})
