import { expect, test } from '@playwright/test'
import { inlineHash } from './helpers.ts'

const doc = '# Title\n\nBody text.\n\n---\n\n# Slide two'

async function pick(page: import('@playwright/test').Page, style: string) {
  await page.getByRole('button', { name: 'Text style' }).click()
  await page.getByRole('menuitemradio', { name: style }).click()
}

test('switching the text style changes the document fonts and is remembered', async ({ page }) => {
  await page.goto('/' + inlineHash(doc))
  const body = page.locator('.markdown-body p').first()
  const modern = await body.evaluate((el) => getComputedStyle(el).fontFamily)
  await pick(page, 'Editorial')
  await expect.poll(() => body.evaluate((el) => getComputedStyle(el).fontFamily)).not.toBe(modern)
  expect(await body.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Charter|Georgia|Palatino|Iowan/)
  await page.getByRole('button', { name: 'Text style' }).click()
  await expect(page.getByRole('menuitemradio', { name: 'Editorial' })).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
  await page.reload()
  await expect.poll(() => page.locator('.markdown-body p').first().evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Charter|Georgia|Palatino|Iowan/)
})

test('technical style uses monospace headings', async ({ page }) => {
  await page.goto('/' + inlineHash(doc))
  await pick(page, 'Technical')
  await expect
    .poll(() => page.locator('.markdown-body h1').first().evaluate((el) => getComputedStyle(el).fontFamily))
    .toMatch(/mono/i)
})

test('slides use the chosen style', async ({ page }) => {
  await page.goto('/' + inlineHash(doc))
  await pick(page, 'Editorial')
  await page.getByRole('button', { name: 'Present' }).click()
  const slideText = page.getByRole('dialog', { name: 'Presentation' }).locator('.markdown-body p').first()
  await expect.poll(() => slideText.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Charter|Georgia|Palatino|Iowan/)
})
