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

for (const width of [320, 390]) {
  test(`at ${width}px the status bar fits the screen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 })
    await page.goto('/')
    await page.getByRole('textbox', { name: /Paste or type Markdown/ }).fill('# Fits\n\nSome words here.')
    await page.waitForTimeout(700)
    const bar = page.getByRole('group', { name: 'Document status' })
    const overflow = await bar.evaluate((el) => {
      const box = el.getBoundingClientRect()
      return Array.from(el.querySelectorAll('*')).some((child) => {
        const r = child.getBoundingClientRect()
        return r.width > 0 && (r.right > box.right + 1 || r.left < box.left - 1)
      }) || el.scrollWidth > el.clientWidth + 1
    })
    expect(overflow).toBe(false)
    await expect(bar).toContainText('words')
  })
}
