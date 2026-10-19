import { expect, test, type Page } from '@playwright/test'
import { editorValue } from './helpers.ts'

const editor = (page: Page) => page.getByRole('textbox', { name: /Paste or type Markdown/ })

async function openSeal(page: Page) {
  await page.goto('/')
  await editor(page).fill('# Doc')
  await page.getByRole('button', { name: 'Seal link' }).click()
  await expect(page.getByRole('dialog', { name: 'Document sealed' })).toBeVisible()
}

test('Ctrl/Cmd+K does not open the palette over the seal dialog', async ({ page }) => {
  await openSeal(page)
  await page.keyboard.press('ControlOrMeta+k')
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Document sealed' })).toBeVisible()
})

test('Escape in the palette does not also end a presentation', async ({ page }) => {
  await page.goto('/#/')
  await page.getByRole('textbox', { name: /Paste or type Markdown/ }).fill('# One\n\n---\n\n# Two')
  await page.getByRole('button', { name: 'Seal link' }).click()
  const url = await page.getByTestId('share-url').inputValue()
  await page.goto(url)
  await page.getByRole('button', { name: 'Command palette' }).click()
  await expect(page.getByRole('dialog', { name: 'Command palette' }).getByRole('combobox')).toBeFocused()
  await page.keyboard.type('present')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Presentation' })).toBeVisible()
  await page.keyboard.press('ControlOrMeta+k')
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toHaveCount(0)
})

test('Escape in an open menu does not close the seal dialog', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Text style' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await openSeal(page)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Document sealed' })).toHaveCount(0)
})

test('Tab stays inside the seal dialog', async ({ page }) => {
  await openSeal(page)
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => !!document.activeElement?.closest('.seal-modal'))).toBe(true)
  }
  await page.keyboard.press('Shift+Tab')
  expect(await page.evaluate(() => !!document.activeElement?.closest('.seal-modal'))).toBe(true)
})

test('focus moves into the seal dialog and back to Seal link', async ({ page }) => {
  await openSeal(page)
  expect(await page.evaluate(() => !!document.activeElement?.closest('.seal-modal'))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Seal link' })).toBeFocused()
})

test('inserting a diagram from the palette works when the editor opened in Read mode', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.addInitScript(() => {
    localStorage.setItem('sealdown.mode', 'read')
    localStorage.setItem('sealdown.draft', '# Doc\n')
  })
  await page.goto('/')
  await page.keyboard.press('ControlOrMeta+k')
  await expect(page.getByRole('dialog', { name: 'Command palette' }).getByRole('combobox')).toBeFocused()
  await page.keyboard.type('insert flowchart')
  await page.keyboard.press('Enter')
  await expect.poll(() => editorValue(page)).toContain('```mermaid\nflowchart LR')
})

for (const width of [375, 320]) {
  test(`at ${width}px the editor fits the screen without page scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 })
    await page.goto('/')
    await editor(page).fill('# Doc')
    const header = (await page.locator('.app-header').boundingBox())!
    expect(header.height).toBeLessThanOrEqual(110)
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true)
    await expect(page.getByRole('group', { name: 'Document status' })).toBeInViewport()
    await expect(page.getByRole('button', { name: 'Seal link' })).toBeInViewport()
  })
}

test('light theme: accent text meets WCAG AA', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sealdown.theme', 'light'))
  await page.goto('/')
  await editor(page).fill('# Doc\n\n[a link](https://example.com)')
  const ratio = await page.evaluate(() => {
    const lum = (c: string) => {
      const [r, g, b] = c.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const contrast = (a: string, b: string) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
      return (x + 0.05) / (y + 0.05)
    }
    const seal = getComputedStyle(document.querySelector('.seal-button')!)
    const link = getComputedStyle(document.querySelector('.markdown-body a')!)
    const paper = getComputedStyle(document.querySelector('.preview-pane .markdown-body')!)
    return { button: contrast(seal.color, seal.backgroundColor), link: contrast(link.color, paper.backgroundColor) }
  })
  expect(ratio.button).toBeGreaterThanOrEqual(4.5)
  expect(ratio.link).toBeGreaterThanOrEqual(4.5)
})
