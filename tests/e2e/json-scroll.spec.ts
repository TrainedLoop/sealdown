import { expect, test, type Page } from '@playwright/test'

const items = Array.from({ length: 200 }, (_, i) => ({ id: i, name: `item ${i}`, tags: ['a', 'b'] }))
const big = JSON.stringify({ title: 'Scroll', items }, null, 2)
// Each item spans 8 lines after the 2-line header: "{", "title", "items": [ …
const lineOf = (index: number) => 4 + index * 8
// The item whose lines include `line` (each item spans 8 lines).
const itemAt = (line: number) => Math.floor((line - 4) / 8)

async function open(page: Page, sync = true) {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.addInitScript(
    ([text, on]) => {
      localStorage.setItem('sealdown.draft.json', text)
      localStorage.setItem('sealdown.mode.json', 'split')
      localStorage.setItem('sealdown.syncScroll', on)
    },
    [big, String(sync)],
  )
  await page.goto('/#/json')
  await page.locator('.json-tree [data-path]').first().waitFor()
  await page.locator('.json-text .cm-content').waitFor()
}

/** The first line number visible in the text pane. */
const topTextLine = (page: Page) =>
  page.locator('.json-text').evaluate((pane) => {
    const scroller = pane.querySelector('.cm-scroller')!.getBoundingClientRect()
    const numbers = Array.from(pane.querySelectorAll('.cm-lineNumbers .cm-gutterElement'))
    const first = numbers.find((el) => el.getBoundingClientRect().bottom > scroller.top + 2 && el.textContent)
    return Number(first?.textContent)
  })

/** The data-path of the first tree row visible in the tree pane. */
const topTreePath = (page: Page) =>
  page.locator('.json-tree').evaluate((pane) => {
    const top = pane.querySelector('.jse-tree-mode > .jse-contents')!.getBoundingClientRect().top
    const rows = Array.from(pane.querySelectorAll<HTMLElement>('[data-path]'))
    const first = rows.find((el) => el.getBoundingClientRect().top >= top - 2)
    return decodeURIComponent(first?.dataset.path ?? '')
  })

test('scrolling the text brings the tree to the same value', async ({ page }) => {
  await open(page)
  await page.locator('.json-text .cm-scroller').evaluate((el, line) => {
    const lineHeight = el.querySelector('.cm-line')!.getBoundingClientRect().height
    el.scrollTop = (line - 1) * lineHeight
  }, lineOf(60))
  await page.waitForTimeout(300)
  const index = itemAt(await topTextLine(page))
  expect(index).toBeGreaterThan(50)
  await expect.poll(() => topTreePath(page)).toMatch(new RegExp(`^/items/${index}(/|$)`))
})

test('past the items a long array shows, the tree stops at the last one shown', async ({ page }) => {
  await open(page)
  await page.locator('.json-text .cm-scroller').evaluate((el, line) => {
    const lineHeight = el.querySelector('.cm-line')!.getBoundingClientRect().height
    el.scrollTop = (line - 1) * lineHeight
  }, lineOf(160))
  // Item 99 is the last one shown; the tree scrolls as far as it can towards it.
  await expect.poll(() => page.locator('.json-tree .jse-tree-mode > .jse-contents').evaluate((el) => {
    const row = el.querySelector<HTMLElement>(`[data-path="${encodeURIComponent('/items/99')}"]`)!.getBoundingClientRect()
    const box = el.getBoundingClientRect()
    return row.top >= box.top - 1 && row.top < box.bottom
  })).toBe(true)
  expect(await topTreePath(page)).toMatch(/^\/items\/9\d/)
})

test('scrolling the tree brings the text to the same value', async ({ page }) => {
  await open(page)
  await page.locator('.json-tree .jse-tree-mode > .jse-contents').evaluate((el) => {
    const row = el.querySelector<HTMLElement>(`[data-path="${encodeURIComponent('/items/80')}"]`)!
    el.scrollTop += row.getBoundingClientRect().top - el.getBoundingClientRect().top
  })
  await expect.poll(() => topTextLine(page)).toBe(lineOf(80))
})

test('sync off leaves the other pane alone', async ({ page }) => {
  await open(page, false)
  await page.locator('.json-text .cm-scroller').evaluate((el) => (el.scrollTop = 3000))
  await page.waitForTimeout(500)
  expect(await page.locator('.json-tree .jse-tree-mode > .jse-contents').evaluate((el) => el.scrollTop)).toBe(0)
})

test('the Sync scroll toggle shows in Split and switches it', async ({ page }) => {
  await open(page)
  const toggle = page.getByRole('button', { name: 'Sync scroll' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('tab', { name: 'Write' }).click()
  await expect(toggle).toHaveCount(0)
})

test('wheel scrolling either pane moves steadily, with the other following', async ({ page }) => {
  await open(page)
  const text = page.locator('.json-text .cm-scroller')
  const treeScroller = page.locator('.json-tree .jse-tree-mode > .jse-contents')
  await text.hover()
  let previous = 0
  for (let step = 0; step < 6; step++) {
    await page.mouse.wheel(0, 400)
    await page.waitForTimeout(150)
    const now = await text.evaluate((el) => el.scrollTop)
    expect(now).toBeGreaterThan(previous)
    previous = now
  }
  await expect.poll(() => treeScroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  await treeScroller.hover()
  const before = await text.evaluate((el) => el.scrollTop)
  previous = await treeScroller.evaluate((el) => el.scrollTop)
  for (let step = 0; step < 4; step++) {
    await page.mouse.wheel(0, 300)
    await page.waitForTimeout(150)
    const now = await treeScroller.evaluate((el) => el.scrollTop)
    expect(now).toBeGreaterThan(previous)
    previous = now
  }
  await expect.poll(() => text.evaluate((el) => el.scrollTop)).toBeGreaterThan(before)
})
