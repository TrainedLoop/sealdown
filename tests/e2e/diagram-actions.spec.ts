import { expect, test } from '@playwright/test'
import { inlineHash } from './helpers.ts'

const doc = '```mermaid\ngraph TD; A[Hello]-->B[World]\n```\n'

test('expand opens the diagram full screen; Escape closes it', async ({ page }) => {
  await page.goto('/' + inlineHash(doc))
  await page.locator('figure.diagram').getByRole('button', { name: 'Expand' }).click()
  const dialog = page.getByRole('dialog', { name: 'Diagram' })
  await expect(dialog.locator('svg').first()).toBeVisible()
  const box = (await dialog.locator('svg').first().boundingBox())!
  expect(box.width).toBeGreaterThan(600)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('clicking the backdrop closes the expanded diagram', async ({ page }) => {
  await page.goto('/' + inlineHash(doc))
  await page.locator('figure.diagram').getByRole('button', { name: 'Expand' }).click()
  await page.mouse.click(5, 5)
  await expect(page.getByRole('dialog', { name: 'Diagram' })).toHaveCount(0)
})

test('copy image puts a PNG on the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/' + inlineHash(doc))
  // The button's name changes to "Copied", so keep a handle that doesn't depend on it.
  const button = page.locator('figure.diagram .diagram-actions button').nth(1)
  await expect(button).toHaveText('Copy image')
  await button.click()
  await expect(button).toHaveText('Copied')
  const types = await page.evaluate(async () => (await navigator.clipboard.read()).flatMap((item) => item.types))
  expect(types).toContain('image/png')
})

test('copy image explains when the browser refuses', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { write: () => Promise.reject(new DOMException('no', 'NotAllowedError')) } })
  })
  await page.goto('/' + inlineHash(doc))
  await page.locator('figure.diagram').getByRole('button', { name: 'Copy image' }).click()
  await expect(page.locator('figure.diagram').getByRole('alert')).toContainText("Couldn't copy")
})

test('diagram actions stay out of the way until the diagram is hovered or focused', async ({ page }) => {
  await page.goto('/' + inlineHash('# Doc\n\n' + doc))
  const figure = page.locator('figure.diagram')
  const actions = figure.locator('.diagram-actions')
  await expect(figure.locator('svg').first()).toBeVisible()
  await page.mouse.move(0, 0)
  await expect(actions).toHaveCSS('opacity', '0')
  await figure.hover()
  await expect(actions).toHaveCSS('opacity', '1')
  await page.mouse.move(0, 0)
  await figure.getByRole('button', { name: 'Expand' }).focus()
  await expect(actions).toHaveCSS('opacity', '1')
  // Over the diagram's corner, not in a row of its own below it.
  const figureBox = (await figure.boundingBox())!
  const actionsBox = (await actions.boundingBox())!
  expect(actionsBox.y).toBeLessThan(figureBox.y + 40)
})
