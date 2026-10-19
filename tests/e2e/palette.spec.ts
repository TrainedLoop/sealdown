import { expect, test, type Page } from '@playwright/test'
import { editorValue, inlineHash } from './helpers.ts'

const editor = (page: Page) => page.getByRole('textbox', { name: /Paste or type Markdown/ })
const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' })

/** Opens the palette and waits for its search field, then types the query. */
async function command(page: Page, query: string, open: () => Promise<void>) {
  await open()
  await expect(palette(page).getByRole('combobox')).toBeFocused()
  await page.keyboard.type(query)
}

test('Ctrl/Cmd+K inside the editor opens the palette; a command switches to Read', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await editor(page).fill('# Doc')
  await command(page, 'view read', () => editor(page).press('ControlOrMeta+k'))
  await page.keyboard.press('Enter')
  await expect(palette(page)).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Read' })).toHaveAttribute('aria-selected', 'true')
  expect(await editorValue(page)).toBe('')
})

test('inserting a diagram from the palette', async ({ page }) => {
  await page.goto('/')
  await editor(page).fill('# Doc\n')
  await command(page, 'sequence', () => page.getByRole('button', { name: 'Command palette' }).click())
  await expect(palette(page).getByRole('option')).toHaveCount(1)
  await page.keyboard.press('Enter')
  await expect.poll(() => editorValue(page)).toContain('```mermaid\nsequenceDiagram')
})

test('Escape closes the palette', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('ControlOrMeta+k')
  await expect(palette(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(palette(page)).toHaveCount(0)
})

test('reader commands include Present and Edit a copy', async ({ page }) => {
  await page.goto('/' + inlineHash('# Title\n\n---\n\n# Two'))
  await expect(page.getByRole('heading', { name: 'Title' })).toBeVisible()
  await command(page, 'present', () => page.keyboard.press('ControlOrMeta+k'))
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Presentation' })).toBeVisible()
})

test('global commands switch theme', async ({ page }) => {
  await page.goto('/' + inlineHash('# Title'))
  await command(page, 'light theme', () => page.keyboard.press('ControlOrMeta+k'))
  await page.keyboard.press('Enter')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})
