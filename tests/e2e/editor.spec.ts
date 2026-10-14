import { expect, test, type Page } from '@playwright/test'
import { editorValue } from './helpers.ts'

// The e2e build has no Supabase configuration, so storage is always unavailable here.

const editor = (page: Page) => page.getByRole('textbox', { name: /Paste or type Markdown/ })

function randomWords(bytes: number): string {
  const words: string[] = []
  let size = 0
  while (size < bytes) {
    const w = Math.random().toString(36).slice(2, 9)
    words.push(w)
    size += w.length + 1
  }
  return words.join(' ')
}

test('code and preview tabs', async ({ page }) => {
  await page.goto('/')
  await editor(page).fill('# Title\n\nBody')
  await page.getByRole('tab', { name: 'Preview' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Title' })).toBeVisible()
  await expect(editor(page)).toBeHidden()
  await page.getByRole('tab', { name: 'Code' }).click()
  await expect.poll(() => editorValue(page)).toBe('# Title\n\nBody')
})

test('draft survives a reload', async ({ page }) => {
  await page.goto('/')
  await editor(page).fill('draft text')
  await page.waitForTimeout(700)
  await page.reload()
  await expect.poll(() => editorValue(page)).toBe('draft text')
})

test('short document produces an inline link that opens', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await editor(page).fill('# Shared\n\nHello')
  await page.getByRole('button', { name: 'Generate link' }).click()
  const url = await page.getByTestId('share-url').inputValue()
  expect(url).toContain('#/v/')
  await expect(page.getByRole('status')).toHaveText('Link copied to the clipboard.')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url)

  const reader = await context.newPage()
  await reader.goto(url)
  await expect(reader.getByRole('heading', { name: 'Shared' })).toBeVisible()
})

test('large document falls back to a long link when storage is unavailable', async ({ page }) => {
  await page.goto('/')
  await editor(page).fill(randomWords(20_000))
  await page.getByRole('button', { name: 'Generate link' }).click()
  await expect(page.getByRole('alert')).toContainText("Couldn't save the document")
  await expect(page.getByTestId('share-url')).toHaveValue(/#\/v\//)
})

test('oversized document is refused', async ({ page }) => {
  await page.goto('/')
  const big = await page.evaluate(() =>
    Array.from({ length: 1_000_000 }, () => String.fromCharCode(0x4e00 + Math.floor(Math.random() * 20000))).join(''),
  )
  await editor(page).fill(big)
  await page.getByRole('button', { name: 'Generate link' }).click()
  await expect(page.getByRole('alert')).toContainText('too large to share by link')
  await expect(page.getByTestId('share-url')).toHaveCount(0)
})

test('blocked clipboard asks to copy manually', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) },
    })
  })
  await page.goto('/')
  await editor(page).fill('# Hi')
  await page.getByRole('button', { name: 'Generate link' }).click()
  await expect(page.getByRole('status')).toHaveText('Copy the link below.')
  await expect(page.getByTestId('share-url')).toHaveValue(/#\/v\//)
})

test('editing after generating clears the stale link', async ({ page }) => {
  await page.goto('/')
  await editor(page).fill('# One')
  await page.getByRole('button', { name: 'Generate link' }).click()
  await expect(page.getByTestId('share-url')).toBeVisible()
  await editor(page).fill('# Two')
  await expect(page.getByTestId('share-url')).toHaveCount(0)
})

test('edits made right before leaving the editor are kept', async ({ page }) => {
  await page.goto('/')
  await editor(page).fill('typed just before leaving')
  await page.evaluate(() => (location.hash = '#/x/elsewhere'))
  await page.evaluate(() => (location.hash = '#/'))
  await expect.poll(() => editorValue(page)).toBe('typed just before leaving')
})

test('the editor highlights Markdown syntax', async ({ page }) => {
  await page.goto('/')
  await editor(page).fill('# Big title\n\nplain')
  const heading = page.locator('.cm-line').first().locator('span', { hasText: 'Big title' }).first()
  await expect(heading).toBeVisible()
  expect(await heading.evaluate((el) => getComputedStyle(el).fontWeight)).toBe('700')
})

test('the editor keeps a fixed height and scrolls its content', async ({ page }) => {
  await page.goto('/')
  const lines = Array.from({ length: 200 }, (_, i) => `Line ${i}`).join('\n')
  await editor(page).fill(lines)
  const box = (await page.locator('.cm-editor').boundingBox())!
  const viewport = page.viewportSize()!
  expect(box.height).toBeLessThanOrEqual(viewport.height * 0.75)
  const scroller = page.locator('.cm-scroller')
  expect(await scroller.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
})
