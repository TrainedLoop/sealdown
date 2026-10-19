import { expect, test, type Page } from '@playwright/test'

const editor = (page: Page) => page.getByRole('textbox', { name: /Paste or type Markdown/ })

test('write, split and read modes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await editor(page).fill('# Hello\n\ntext')
  await page.getByRole('tab', { name: 'Split' }).click()
  await expect(editor(page)).toBeVisible()
  await expect(page.locator('.preview-pane').getByRole('heading', { name: 'Hello' })).toBeVisible()
  await page.getByRole('tab', { name: 'Read' }).click()
  await expect(editor(page)).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Hello' })).toBeVisible()
  await page.getByRole('tab', { name: 'Write' }).click()
  await expect(editor(page)).toBeVisible()
  await expect(page.locator('.preview-pane')).toHaveCount(0)
})

test('the mode is remembered', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await page.getByRole('tab', { name: 'Read' }).click()
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Read' })).toHaveAttribute('aria-selected', 'true')
})

test('split is not offered on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto('/')
  await expect(page.getByRole('tab', { name: 'Split' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Write' })).toHaveAttribute('aria-selected', 'true')
})

test('in split mode the preview follows the editor scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await page.getByRole('tab', { name: 'Split' }).click()
  const sections = Array.from({ length: 30 }, (_, i) => `## Section ${i}\n\n${'Some text. '.repeat(20)}`).join('\n\n')
  await editor(page).fill(sections)
  const pane = page.locator('.preview-pane')
  await expect(pane.getByRole('heading', { name: 'Section 29' })).toBeAttached()
  // CodeMirror renders only lines near the viewport: scroll in steps until "## Section 20" is at the top.
  const scroller = page.locator('.cm-scroller')
  await scroller.evaluate((el) => el.scrollTo(0, 0)) // fill() leaves the cursor, and the view, at the end
  await page.waitForTimeout(100)
  for (let i = 0; i < 200; i++) {
    const offset = await scroller.evaluate((el) => {
      const line = Array.from(el.querySelectorAll('.cm-line')).find((l) => l.textContent === '## Section 20')
      return line ? line.getBoundingClientRect().top - el.getBoundingClientRect().top : null
    })
    if (offset !== null && offset >= 0 && offset < 40) break
    await scroller.evaluate((el, by) => el.scrollBy(0, by), offset !== null && offset > 0 ? Math.min(offset - 10, 300) : 300)
    await page.waitForTimeout(30)
  }
  await expect
    .poll(async () => {
      const top = await pane.boundingBox()
      const heading = await pane.getByRole('heading', { name: 'Section 20' }).boundingBox()
      return heading && top ? Math.abs(heading.y - top.y) : 9999
    })
    .toBeLessThan(80)
})

test('in split mode the editor follows the preview scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await page.getByRole('tab', { name: 'Split' }).click()
  const sections = Array.from({ length: 30 }, (_, i) => `## Section ${i}\n\n${'Some text. '.repeat(20)}`).join('\n\n')
  await editor(page).fill(sections)
  const pane = page.locator('.preview-pane')
  await expect(pane.getByRole('heading', { name: 'Section 29' })).toBeAttached()
  // Bring "Section 20" to the top of the preview.
  await pane.evaluate((el) => {
    const heading = Array.from(el.querySelectorAll('h2')).find((h) => h.textContent === 'Section 20')!
    el.scrollTop += heading.getBoundingClientRect().top - el.getBoundingClientRect().top
  })
  await expect.poll(async () => (await page.locator('.cm-line', { hasText: '## Section 20' }).count()) > 0).toBe(true)
  await expect
    .poll(async () => {
      const scroller = (await page.locator('.cm-scroller').boundingBox())!
      const box = await page.locator('.cm-line', { hasText: '## Section 20' }).boundingBox()
      return box ? Math.abs(box.y - scroller.y) : 9999
    })
    .toBeLessThan(80)
})

test('read mode in the editor shows the table of contents', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  const filler = Array.from({ length: 40 }, (_, i) => `Paragraph ${i}.`).join('\n\n')
  await editor(page).fill(`# One\n\n${filler}\n\n## Two\n\n${filler}\n\n## Three\n\nEnd.`)
  await page.getByRole('tab', { name: 'Read' }).click()
  const toc = page.getByRole('navigation', { name: 'Contents' })
  await expect(toc).toBeVisible()
  const before = await page.evaluate(() => location.hash)
  await toc.getByRole('link', { name: 'Three' }).click()
  await expect(page.getByRole('heading', { name: 'Three' })).toBeInViewport()
  expect(await page.evaluate(() => location.hash)).toBe(before)
})
