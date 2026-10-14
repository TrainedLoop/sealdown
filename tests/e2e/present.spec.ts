import { expect, test } from '@playwright/test'
import { inlineHash } from './helpers.ts'

const deck = '# One\n\n---\n\n# Two\n\n```mermaid\ngraph TD; A-->B\n```\n\n---\n\n# Three'

test('presents the document as slides', async ({ page }) => {
  await page.goto('/' + inlineHash(deck))
  await page.getByRole('button', { name: 'Present' }).click()
  const dialog = page.getByRole('dialog', { name: 'Presentation' })
  await expect(dialog.getByRole('heading', { name: 'One' })).toBeVisible()
  await expect(dialog.getByText('1 / 3')).toBeVisible()

  await page.keyboard.press('ArrowRight')
  await expect(dialog.getByRole('heading', { name: 'Two' })).toBeVisible()
  await expect(dialog.locator('figure.diagram svg').first()).toBeVisible()
  await page.keyboard.press('Space')
  await expect(dialog.getByRole('heading', { name: 'Three' })).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(dialog.getByText('3 / 3')).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(dialog.getByText('2 / 3')).toBeVisible()
  await page.keyboard.press('Home')
  await expect(dialog.getByText('1 / 3')).toBeVisible()
  await page.keyboard.press('End')
  await expect(dialog.getByText('3 / 3')).toBeVisible()

  await dialog.getByRole('button', { name: 'Previous slide' }).click()
  await expect(dialog.getByText('2 / 3')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'One' })).toBeVisible()
})

test('swiping changes slides', async ({ page }) => {
  await page.goto('/' + inlineHash(deck))
  await page.getByRole('button', { name: 'Present' }).click()
  const dialog = page.getByRole('dialog', { name: 'Presentation' })
  const box = (await dialog.boundingBox())!
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width * 0.8, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.2, y, { steps: 5 })
  await page.mouse.up()
  await expect(dialog.getByText('2 / 3')).toBeVisible()
})

test('the start of a slide taller than the screen can be reached', async ({ page }) => {
  const long = '# Very top\n\n' + Array.from({ length: 80 }, (_, i) => `Paragraph ${i}.`).join('\n\n')
  await page.goto('/' + inlineHash(long))
  await page.getByRole('button', { name: 'Present' }).click()
  const dialog = page.getByRole('dialog', { name: 'Presentation' })
  await dialog.locator('.slide').evaluate((el) => el.scrollTo(0, 0))
  await expect(dialog.getByRole('heading', { name: 'Very top' })).toBeInViewport()
})
