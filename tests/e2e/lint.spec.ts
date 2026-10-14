import { expect, test } from '@playwright/test'

test('broken mermaid is underlined in the editor and clears when fixed', async ({ page }) => {
  await page.goto('/')
  const editor = page.getByRole('textbox', { name: /Paste or type Markdown/ })
  await editor.fill('# Doc\n\n```mermaid\ngraph TD\n  A -->\n```\n')
  await expect(page.locator('.cm-lintRange-error')).toHaveCount(1, { timeout: 10_000 })
  await editor.fill('# Doc\n\n```mermaid\ngraph TD\n  A --> B\n```\n')
  await expect(page.locator('.cm-lintRange-error')).toHaveCount(0, { timeout: 10_000 })
})

test('documents without diagrams do not load Mermaid in the editor', async ({ page }) => {
  const requested: string[] = []
  page.on('request', (r) => requested.push(r.url()))
  await page.goto('/')
  await page.getByRole('textbox', { name: /Paste or type Markdown/ }).fill('# Just text')
  await page.waitForTimeout(1500)
  expect(requested.filter((u) => /mermaid/i.test(u))).toEqual([])
})
