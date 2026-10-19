import { expect, test, type Page } from '@playwright/test'
import { inlineHash, withTheme } from './helpers.ts'

const fence = (lang: string, body: string) => '```' + lang + '\n' + body + '\n```\n'

async function open(page: Page, text: string) {
  await page.goto('/' + inlineHash(text))
}

test('flowchart renders as svg', async ({ page }) => {
  await open(page, fence('mermaid', 'graph TD; A-->B'))
  await expect(page.locator('figure.diagram svg')).toBeVisible()
  await expect(page.locator('pre.mermaid-src')).toHaveCount(0)
})

test('one broken diagram does not stop the others and leaves no debris', async ({ page }) => {
  await open(page, fence('mermaid', 'graph TD; A-->') + '\nbetween\n\n' + fence('mermaid', 'graph TD; C-->D'))
  const figures = page.locator('figure.diagram')
  await expect(figures).toHaveCount(2)
  await expect(figures.nth(1).locator('svg')).toBeVisible()
  const broken = figures.nth(0)
  await expect(broken.getByRole('alert')).toContainText("This diagram couldn't be rendered")
  await expect(broken.locator('pre')).toContainText('graph TD; A-->')
  await expect(page.getByText('between')).toBeVisible()
  expect(await page.locator('body > [id^="rmd-"], body > [id^="drmd-"]').count()).toBe(0)
})

test('diagrams re-render when the theme changes', async ({ page }) => {
  await withTheme(page, 'light')
  await open(page, fence('mermaid', 'graph TD; A-->B'))
  const node = page.locator('figure.diagram svg .node rect').first()
  await expect(node).toBeVisible()
  const lightFill = await node.evaluate((el) => getComputedStyle(el).fill)
  await page.getByRole('button', { name: 'Dark theme' }).click()
  await expect
    .poll(() => page.locator('figure.diagram svg .node rect').first().evaluate((el) => getComputedStyle(el).fill))
    .not.toBe(lightFill)
})

test('math renders with KaTeX and errors stay local', async ({ page }) => {
  await open(page, 'Area $a^2$.\n\nBad $\\frac{$ formula.\n\nAfter math.')
  await expect(page.locator('.katex').first()).toBeVisible()
  await expect(page.locator('.katex-error')).toBeVisible()
  await expect(page.getByText('After math.')).toBeVisible()
})

test('code blocks are highlighted', async ({ page }) => {
  await open(page, fence('ts', 'const answer: number = 42'))
  await expect(page.locator('code.language-ts .hljs-keyword').first()).toHaveText('const')
})

test('unknown code language stays plain', async ({ page }) => {
  await open(page, fence('nosuchlang', 'plain text') + '\nafter')
  await expect(page.locator('code.language-nosuchlang')).toHaveText('plain text\n')
  await expect(page.getByText('after')).toBeVisible()
})

test('documents without diagrams or math do not load those libraries', async ({ page }) => {
  const requested: string[] = []
  page.on('request', (r) => requested.push(r.url()))
  await open(page, '# Plain\n\nJust text.')
  await expect(page.getByRole('heading', { name: 'Plain' })).toBeVisible()
  await page.waitForLoadState('networkidle')
  expect(requested.filter((u) => /mermaid|katex/i.test(u))).toEqual([])
})

test('zenuml diagrams render', async ({ page }) => {
  await open(page, fence('mermaid', 'zenuml\n  Alice->Bob: Hello'))
  await expect(page.locator('figure.diagram svg').first()).toBeVisible()
  await expect(page.locator('figure.diagram [role="alert"]')).toHaveCount(0)
})

test('mermaid labels cannot run script', async ({ page }) => {
  await open(page, fence('mermaid', 'graph TD; A["<img src=x onerror=window.__xss=1>"]-->B'))
  await expect(page.locator('figure.diagram svg')).toBeVisible()
  await page.waitForTimeout(300)
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
})

test('a library that fails to load shows the source with a retry', async ({ page }) => {
  await page.route(/katex/i, (route) => route.abort())
  await open(page, 'Area $a^2$ here.')
  const notice = page.getByRole('alert')
  await expect(notice).toContainText("Couldn't load what this block needs")
  await expect(page.locator('.math-src')).toHaveText('a^2')
  await page.unroute(/katex/i)
  await notice.getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('.katex').first()).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})
