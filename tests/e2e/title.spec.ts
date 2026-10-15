import { expect, test } from '@playwright/test'
import { inlineHash } from './helpers.ts'

test('the document title shows in the header and the browser tab', async ({ page }) => {
  await page.goto('/' + inlineHash('---\ntitle: Quarterly plan\nauthor: Ana\n---\n\n# Something else'))
  await expect(page.locator('.app-header .doc-title')).toHaveText('Quarterly plan')
  await expect(page).toHaveTitle('Quarterly plan · sealdown')
  await expect(page.locator('table.front-matter')).toContainText('Ana')
})

test('the editor title follows the first heading', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('textbox', { name: /Paste or type Markdown/ }).fill('# Draft title\n\ntext')
  await expect(page.locator('.app-header .doc-title')).toHaveText('Draft title')
  await expect(page).toHaveTitle('Draft title · sealdown')
})
