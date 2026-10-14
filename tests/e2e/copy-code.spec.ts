import { expect, test } from '@playwright/test'
import { inlineHash } from './helpers.ts'

test('code blocks have a copy button that copies the exact code', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const code = 'const a = 1 < 2\nconsole.log("hi")'
  await page.goto('/' + inlineHash('```ts\n' + code + '\n```\n\n```mermaid\ngraph TD; A-->B\n```\n'))
  await expect(page.locator('figure.diagram svg')).toBeVisible()
  const buttons = page.getByRole('button', { name: 'Copy code' })
  await expect(buttons).toHaveCount(1)
  await buttons.click()
  await expect(buttons).toHaveText('Copied')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code + '\n')
})
