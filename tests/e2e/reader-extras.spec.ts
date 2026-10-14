import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { inlineHash } from './helpers.ts'

const filler = Array.from({ length: 60 }, (_, i) => `Paragraph ${i}.`).join('\n\n')
const flowchart = '```mermaid\ngraph TD; A[Hello]-->B[World]\n```\n'

async function open(page: Page, text: string) {
  await page.goto('/' + inlineHash(text))
}

test('table of contents appears with 3+ headings and scrolls without touching the hash', async ({ page }) => {
  await open(page, `# One\n\n${filler}\n\n## Two\n\n${filler}\n\n## Three\n\nEnd.`)
  const hash = await page.evaluate(() => location.hash)
  const toc = page.getByRole('navigation', { name: 'Contents' })
  await toc.getByRole('link', { name: 'Three' }).click()
  await expect(page.getByRole('heading', { name: 'Three' })).toBeInViewport()
  expect(await page.evaluate(() => location.hash)).toBe(hash)
})

test('no table of contents with fewer than 3 headings', async ({ page }) => {
  await open(page, '# One\n\n## Two\n\nText')
  await expect(page.getByRole('heading', { name: 'One' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Contents' })).toHaveCount(0)
})

test('in-document anchor links scroll and keep the document open', async ({ page }) => {
  await open(page, `[go](#intro)\n\n${filler}\n\n## Intro\n\nHere.`)
  const hash = await page.evaluate(() => location.hash)
  await page.getByRole('link', { name: 'go' }).click()
  await expect(page.getByRole('heading', { name: 'Intro' })).toBeInViewport()
  expect(await page.evaluate(() => location.hash)).toBe(hash)
})

test('edit a copy opens the editor with the document', async ({ page }) => {
  await open(page, '# Original\n\nText')
  await page.getByRole('button', { name: 'Edit a copy' }).click()
  await expect(page).toHaveURL(/#\/$/)
  await expect(page.getByRole('textbox', { name: /Paste or type Markdown/ })).toHaveValue('# Original\n\nText')
})

test('download .md returns the original text', async ({ page }) => {
  const text = '# Doc ✓\n\nBody'
  await open(page, text)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download .md' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('document.md')
  expect(await readFile(await file.path(), 'utf8')).toBe(text)
})

test('diagram downloads as SVG', async ({ page }) => {
  await open(page, flowchart)
  const download = page.waitForEvent('download')
  await page.locator('figure.diagram').getByRole('button', { name: 'SVG' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('diagram-1.svg')
  expect((await readFile(await file.path(), 'utf8')).trimStart().startsWith('<svg')).toBe(true)
})

test('diagram with HTML labels downloads as PNG', async ({ page }) => {
  await open(page, flowchart)
  const download = page.waitForEvent('download')
  await page.locator('figure.diagram').getByRole('button', { name: 'PNG' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('diagram-1.png')
  const bytes = await readFile(await file.path())
  expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
  expect(bytes.length).toBeGreaterThan(1024)
})

test('export PDF prints in light theme and restores dark', async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => {
      const rect = document.querySelector('figure.diagram svg .node rect')
      ;(window as unknown as { __printed: unknown }).__printed = {
        theme: document.documentElement.dataset.theme,
        fill: rect ? getComputedStyle(rect).fill : null,
      }
    }
  })
  await page.emulateMedia({ colorScheme: 'light' })
  await open(page, flowchart)
  const lightFill = await page.locator('figure.diagram svg .node rect').first().evaluate((el) => getComputedStyle(el).fill)

  await page.getByRole('button', { name: 'Dark theme' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect
    .poll(() => page.locator('figure.diagram svg .node rect').first().evaluate((el) => getComputedStyle(el).fill))
    .not.toBe(lightFill)

  await page.getByRole('button', { name: 'Export PDF' }).click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printed?: unknown }).__printed)).toEqual({
    theme: 'light',
    fill: lightFill,
  })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect
    .poll(() => page.locator('figure.diagram svg .node rect').first().evaluate((el) => getComputedStyle(el).fill))
    .not.toBe(lightFill)
})
