import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { inlineHash, withTheme } from '../e2e/helpers.ts'

// When Mermaid adds a diagram type, add an example to src/templates/diagrams.md and refresh the baselines
// (`pnpm test:visual --update-snapshots`), reviewing every changed image.
const reference = readFileSync(new URL('../../src/templates/diagrams.md', import.meta.url), 'utf8')
const fenceCount = reference.match(/^```mermaid$/gm)?.length ?? 0

for (const theme of ['light', 'dark'] as const) {
  test(`reference document, ${theme}`, async ({ page }) => {
    await withTheme(page, theme)
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/' + inlineHash(reference))

    const figures = page.locator('figure.diagram')
    await expect(figures).toHaveCount(fenceCount)
    await expect(page.locator('figure.diagram .diagram-svg > svg')).toHaveCount(fenceCount, { timeout: 30_000 })
    await expect(page.locator('figure.diagram [role="alert"]')).toHaveCount(0)
    await expect(page.locator('.katex-display')).toHaveCount(1)
    await page.evaluate(() => document.fonts.ready)

    const headings = await page.locator('.markdown-body h2').allTextContents()
    for (let i = 0; i < fenceCount; i++) {
      const name = headings[i].replace(/\s+/g, '-')
      await expect(figures.nth(i).locator('.diagram-svg')).toHaveScreenshot(`${theme}-${i + 1}-${name}.png`)
    }
    await expect(page.locator('.katex-display')).toHaveScreenshot(`${theme}-math.png`)
    const pres = page.locator('.markdown-body > pre')
    for (let i = 0; i < (await pres.count()); i++) {
      await expect(pres.nth(i)).toHaveScreenshot(`${theme}-code-${i + 1}.png`)
    }
    await expect(page.locator('.markdown-body table')).toHaveScreenshot(`${theme}-table.png`)
  })
}

const syntax = readFileSync(new URL('./syntax.md', import.meta.url), 'utf8')

for (const theme of ['light', 'dark'] as const) {
  test(`syntax reference, ${theme}`, async ({ page }) => {
    await withTheme(page, theme)
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/' + inlineHash(syntax))
    await expect(page.locator('.markdown-alert')).toHaveCount(5)
    await page.evaluate(() => document.fonts.ready)
    await expect(page.locator('.markdown-body')).toHaveScreenshot(`${theme}-syntax.png`)
  })
}
