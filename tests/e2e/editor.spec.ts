import { expect, test, type Page } from '@playwright/test'

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
  await expect(editor(page)).toHaveValue('# Title\n\nBody')
})

test('draft survives a reload', async ({ page }) => {
  await page.goto('/')
  await editor(page).fill('draft text')
  await page.waitForTimeout(700)
  await page.reload()
  await expect(editor(page)).toHaveValue('draft text')
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
