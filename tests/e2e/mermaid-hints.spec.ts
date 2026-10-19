import { expect, test } from '@playwright/test'
import { inlineHash } from './helpers.ts'

const broken = '```mermaid\nsequenceDiagram\n  A->>B: draft ("4 changes"; group = "on save")\n```\n'

test('the reader explains a semicolon that broke a sequence diagram', async ({ page }) => {
  await page.goto('/' + inlineHash(broken))
  const alert = page.locator('figure.diagram').getByRole('alert')
  await expect(alert).toContainText('Line 2')
  await expect(alert).toContainText('#59;')
})

test('the editor underlines the line and explains it on hover', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('textbox', { name: /Paste or type Markdown/ }).fill(broken)
  const mark = page.locator('.cm-lintRange').first()
  await expect(mark).toBeVisible({ timeout: 10_000 })
  await mark.hover()
  await expect(page.locator('.cm-tooltip-lint')).toContainText('#59;')
})

test('braces in a state label get a warning even when Mermaid draws something', async ({ page }) => {
  await page.goto('/')
  await page
    .getByRole('textbox', { name: /Paste or type Markdown/ })
    .fill('```mermaid\nstateDiagram-v2\n  [*] --> Draft\n  Draft --> Compared: compare {flag: true}\n```\n')
  const mark = page.locator('.cm-lintRange').first()
  await expect(mark).toBeVisible({ timeout: 10_000 })
  await mark.hover()
  await expect(page.locator('.cm-tooltip-lint')).toContainText('#123;')
})
