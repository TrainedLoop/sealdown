import { mkdirSync, readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { inlineHash } from '../e2e/helpers.ts'

// Not a test: renders the editor's diagram-menu thumbnails from src/templates/diagrams.md.
// Run with `pnpm thumbs` after changing the examples or updating Mermaid, then commit the PNGs.

const reference = readFileSync(new URL('../../src/templates/diagrams.md', import.meta.url), 'utf8')
const names = Array.from(reference.matchAll(/^## (.+)\n+```mermaid$/gm), (m) => m[1].trim())
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const outDir = 'public/diagram-thumbs'

test.use({ deviceScaleFactor: 2 })

for (const theme of ['light', 'dark'] as const) {
  test(`thumbnails, ${theme}`, async ({ page }) => {
    mkdirSync(outDir, { recursive: true })
    await page.emulateMedia({ colorScheme: theme })
    await page.goto('/' + inlineHash(reference))
    const figures = page.locator('figure.diagram')
    await expect(page.locator('figure.diagram .diagram-svg > svg')).toHaveCount(names.length, { timeout: 30_000 })
    // A fixed 160×100 frame; each diagram scales down to fit, centered.
    await page.addStyleTag({
      content: `figure.diagram .diagram-svg { width: 160px; height: 100px; display: flex; align-items: center;
        justify-content: center; padding: 6px; box-sizing: border-box; background: var(--surface); overflow: hidden; }
        figure.diagram .diagram-svg > svg { max-width: 100% !important; max-height: 100%; width: auto; height: auto; }`,
    })
    for (let i = 0; i < names.length; i++) {
      await figures.nth(i).locator('.diagram-svg').screenshot({ path: `${outDir}/${slug(names[i])}-${theme}.png` })
    }
  })
}
