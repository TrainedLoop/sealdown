import { expect, test, type Page } from '@playwright/test'
import { editorValue, openShare } from './helpers.ts'

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

test('write and read tabs', async ({ page }) => {
  await page.goto('/')
  await editor(page).fill('# Title\n\nBody')
  await page.getByRole('tab', { name: 'Read' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Title' })).toBeVisible()
  await expect(editor(page)).toBeHidden()
  await page.getByRole('tab', { name: 'Write' }).click()
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
  await (await openShare(page)).getByRole('button', { name: 'Seal link' }).click()
  const url = await page.getByTestId('share-url').inputValue()
  expect(url).toMatch(/#\/e\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$/)
  await expect(page.getByRole('status')).toHaveText('Link copied to the clipboard.')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url)

  const reader = await context.newPage()
  await reader.goto(url)
  await expect(reader.getByRole('heading', { name: 'Shared' })).toBeVisible()
})

test('large document falls back to a long link when storage is unavailable', async ({ page }) => {
  await page.goto('/')
  await editor(page).fill(randomWords(20_000))
  await (await openShare(page)).getByRole('button', { name: 'Seal link' }).click()
  await expect(page.getByRole('alert')).toContainText("Couldn't save the document")
  await expect(page.getByTestId('share-url')).toHaveValue(/#\/e\//)
})

test('oversized document is refused', async ({ page }) => {
  await page.goto('/')
  const big = await page.evaluate(() =>
    Array.from({ length: 1_000_000 }, () => String.fromCharCode(0x4e00 + Math.floor(Math.random() * 20000))).join(''),
  )
  await editor(page).fill(big)
  await (await openShare(page)).getByRole('button', { name: 'Seal link' }).click()
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
  await (await openShare(page)).getByRole('button', { name: 'Seal link' }).click()
  await expect(page.getByRole('status')).toHaveText('Copy the link below.')
  await expect(page.getByTestId('share-url')).toHaveValue(/#\/e\//)
})

test('the seal dialog closes with Escape and returns focus to the button', async ({ page }) => {
  await page.goto('/')
  await editor(page).fill('# One')
  await (await openShare(page)).getByRole('button', { name: 'Seal link' }).click()
  await expect(page.getByRole('dialog', { name: 'Document sealed' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Document sealed' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeFocused()
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
  // The editor fills the window but never grows past it: the page itself doesn't scroll.
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true)
  const scroller = page.locator('.cm-scroller')
  expect(await scroller.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
})

test('the editor shows line numbers', async ({ page }) => {
  await page.goto('/')
  await editor(page).fill('one\ntwo\nthree')
  await expect(page.locator('.cm-lineNumbers .cm-gutterElement', { hasText: /^3$/ })).toBeVisible()
})

test('a first visit opens a short sample; once cleared it stays empty', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome to Sealdown' })).toBeVisible()
  await expect(page.locator('figure.diagram svg').first()).toBeVisible()
  await editor(page).fill('')
  await page.waitForTimeout(700)
  await page.reload()
  await expect.poll(() => editorValue(page)).toBe('')
})
