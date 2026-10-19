import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { editorValue, inlineHash, withTheme } from './helpers.ts'

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
  await expect.poll(() => editorValue(page)).toBe('# Original\n\nText')
})

test('download .md returns the original text', async ({ page }) => {
  const text = '# Doc ✓\n\nBody'
  await open(page, text)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: 'Download .md' }).click()
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
  await withTheme(page, 'light')
  await open(page, flowchart)
  const lightFill = await page.locator('figure.diagram svg .node rect').first().evaluate((el) => getComputedStyle(el).fill)

  await page.getByRole('button', { name: 'Dark theme' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect
    .poll(() => page.locator('figure.diagram svg .node rect').first().evaluate((el) => getComputedStyle(el).fill))
    .not.toBe(lightFill)

  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: 'Export PDF' }).click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printed?: unknown }).__printed)).toEqual({
    theme: 'light',
    fill: lightFill,
  })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect
    .poll(() => page.locator('figure.diagram svg .node rect').first().evaluate((el) => getComputedStyle(el).fill))
    .not.toBe(lightFill)
})

test('anchor links and the TOC reach headings named after document properties', async ({ page }) => {
  await open(page, `[see](#implementation)\n\n# Intro\n\n${filler}\n\n## Images\n\n${filler}\n\n## Implementation\n\nDone.`)
  await expect(page.getByRole('navigation', { name: 'Contents' }).getByRole('link')).toHaveCount(3)
  await page.getByRole('link', { name: 'see' }).click()
  await expect(page.getByRole('heading', { name: 'Implementation' })).toBeInViewport()
})

test('SVG download is well-formed XML with multi-line labels', async ({ page }) => {
  await open(page, '```mermaid\ngraph TD; A[Hello<br>World]-->B\n```\n')
  const download = page.waitForEvent('download')
  await page.locator('figure.diagram').getByRole('button', { name: 'SVG' }).click()
  const svg = await readFile(await (await download).path(), 'utf8')
  const error = await page.evaluate(
    (text) => new DOMParser().parseFromString(text, 'image/svg+xml').querySelector('parsererror')?.textContent ?? null,
    svg,
  )
  expect(error).toBeNull()
})

test('PNG export that the browser refuses tells the user instead of failing silently', async ({ page }) => {
  await open(page, '```mermaid\njourney\n  title Trip\n  section Go\n    Walk: 5: Me\n```\n')
  await page.locator('figure.diagram').getByRole('button', { name: 'PNG' }).click()
  await expect(page.locator('figure.diagram').getByRole('alert')).toContainText('PNG')
})

test('PNG export while other diagrams are still rendering succeeds', async ({ page }) => {
  const many = Array.from({ length: 12 }, (_, i) => `\`\`\`mermaid\ngraph TD; A${i}[Node ${i}]-->B${i}[Next]\n\`\`\`\n`).join('\n')
  await open(page, many)
  const first = page.locator('figure.diagram').first()
  await first.getByRole('button', { name: 'PNG' }).click()
  const file = await page.waitForEvent('download')
  const bytes = await readFile(await file.path())
  expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
})

test('browser print in dark theme uses dark text on the white page', async ({ page }) => {
  await withTheme(page, 'dark')
  await open(page, '# Printable\n\nBody text.')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ media: 'print', colorScheme: 'dark' })
  const color = await page.locator('.markdown-body p').evaluate((el) => getComputedStyle(el).color)
  const [r, g, b] = color.match(/\d+/g)!.map(Number)
  expect((r + g + b) / 3).toBeLessThan(100)
})

test('edit a copy asks before replacing an existing draft', async ({ page }) => {
  await page.goto('/')
  const draft = page.getByRole('textbox', { name: /Paste or type Markdown/ })
  await draft.fill('my unsaved work')
  await page.waitForTimeout(700)
  await open(page, '# Shared doc')

  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Edit a copy' }).click()
  await expect(page.getByRole('heading', { name: 'Shared doc' })).toBeVisible()

  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain('Replace')
    void dialog.accept()
  })
  await page.getByRole('button', { name: 'Edit a copy' }).click()
  await expect.poll(() => editorValue(page)).toBe('# Shared doc')
})

test('edit a copy does not ask when there is no draft', async ({ page }) => {
  let asked = false
  page.on('dialog', (dialog) => {
    asked = true
    void dialog.dismiss()
  })
  await open(page, '# Shared doc')
  await page.getByRole('button', { name: 'Edit a copy' }).click()
  await expect.poll(() => editorValue(page)).toBe('# Shared doc')
  expect(asked).toBe(false)
})

test('encrypted documents say they were unsealed only in this browser', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('textbox', { name: /Paste or type Markdown/ }).fill('# Sealed note')
  await page.getByRole('button', { name: 'Seal link' }).click()
  const url = await page.getByTestId('share-url').inputValue()
  await page.goto(url)
  await expect(page.getByRole('heading', { name: 'Sealed note' })).toBeVisible()
  await expect(page.getByText('Unsealed only in this browser')).toBeVisible()
})

test('legacy plaintext links do not claim to be encrypted', async ({ page }) => {
  await page.goto('/' + inlineHash('# Old plaintext'))
  await expect(page.getByRole('heading', { name: 'Old plaintext' })).toBeVisible()
  await expect(page.getByText('Unsealed only in this browser')).toHaveCount(0)
})

test('reader actions live in the top bar', async ({ page }) => {
  await page.goto('/' + inlineHash('# Doc'))
  const header = page.locator('.app-header')
  await expect(header.getByRole('button', { name: 'Edit a copy' })).toBeVisible()
  await expect(header.getByRole('button', { name: 'Present' })).toBeVisible()
  await expect(header.getByRole('button', { name: 'Export' })).toBeVisible()
})
