import { expect, test } from '@playwright/test'
import { inlineHash } from './helpers.ts'

test('renders an inline document', async ({ page }) => {
  await page.goto('/' + inlineHash('# Hello\n\nSome **text**.'))
  await expect(page.getByRole('heading', { level: 1, name: 'Hello' })).toBeVisible()
  await expect(page.locator('strong')).toHaveText('text')
})

test('corrupt link shows the incomplete-link message', async ({ page }) => {
  await page.goto('/#/v/AAAA')
  await expect(page.getByRole('alert')).toContainText('This link looks incomplete')
})

test('malformed link shows the incomplete-link message', async ({ page }) => {
  await page.goto('/#/s/short.key')
  await expect(page.getByRole('alert')).toContainText('This link looks incomplete')
})

test('unknown format asks to reload', async ({ page }) => {
  await page.goto('/#/x/whatever')
  await expect(page.getByRole('alert')).toContainText('newer version of sealdown')
})

test.describe('with a Portuguese browser', () => {
  test.use({ locale: 'pt-BR' })
  test('UI is English by default', async ({ page }) => {
    await page.goto('/#/v/AAAA')
    await expect(page.getByRole('alert')).toContainText('This link looks incomplete')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })
})

test('language toggle switches and persists', async ({ page }) => {
  await page.goto('/#/v/AAAA')
  await page.getByRole('button', { name: 'Português' }).click()
  await expect(page.getByRole('alert')).toContainText('Este link parece incompleto')
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('Este link parece incompleto')
})

test('theme toggle flips and persists', async ({ page }) => {
  await page.goto('/' + inlineHash('# Hi'))
  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Light theme' }).click()
  await expect(html).toHaveAttribute('data-theme', 'light')
  await page.reload()
  await expect(html).toHaveAttribute('data-theme', 'light')
})

test('dark by default, even when the system prefers light', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/' + inlineHash('# Hi'))
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})
