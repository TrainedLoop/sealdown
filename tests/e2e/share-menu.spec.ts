import { expect, test } from '@playwright/test'

const editor = (page: import('@playwright/test').Page) => page.getByRole('textbox', { name: /Paste or type Markdown/ })

test('Share opens a menu with Seal link and the optional password', async ({ page }) => {
  await page.goto('/')
  await editor(page).fill('# Doc')
  await expect(page.getByRole('button', { name: 'Seal link' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  const panel = page.getByRole('dialog', { name: 'Share' })
  await expect(panel.getByLabel('Password', { exact: true })).toBeFocused()
  await panel.getByLabel('Password', { exact: true }).fill('pw')
  await panel.getByRole('button', { name: 'Seal link' }).click()
  await expect(panel).toBeHidden()
  await expect(page.getByTestId('share-url')).toHaveValue(/#\/p\//)
})

test('Escape closes the Share menu and returns focus to the button', async ({ page }) => {
  await page.goto('/')
  await editor(page).fill('# Doc')
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Share' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeFocused()
})

test('Share to edit is not offered without storage', async ({ page }) => {
  await page.goto('/')
  await editor(page).fill('# Doc')
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Share' }).getByRole('button', { name: 'Share to edit' })).toHaveCount(0)
})

test('on phones Share is in the header', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeInViewport()
})
