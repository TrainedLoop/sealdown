import { expect, test, type Page } from '@playwright/test'
import { editorValue, openShare } from './helpers.ts'

// Runs against the local Supabase (scripts/e2e-stored.sh), Realtime included.

const editor = (page: Page) => page.getByRole('textbox', { name: /Paste or type Markdown/ })
const liveBar = (page: Page) => page.getByRole('region', { name: 'Live document' })
const FAST = { timeout: 4000 }

/** Polling can't deliver anything on this page: only the Realtime push can. */
async function deaf(page: Page) {
  await page.route('**/rpc/live_head', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '1' }))
}

test('Share to edit turns the sharing tab into the live document; the local draft stays', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sealdown.author', 'Ana'))
  await page.goto('/')
  await editor(page).fill('# Shared from here')
  await (await openShare(page)).getByRole('button', { name: 'Share to edit' }).click()
  const dialog = page.getByRole('dialog', { name: 'Shared for editing' })
  await expect(dialog).toBeVisible()
  await expect(page).toHaveURL(/#\/w\//)
  await page.keyboard.press('Escape')
  await expect(liveBar(page)).toContainText('v1')
  await expect.poll(() => editorValue(page)).toBe('# Shared from here')
  await page.getByRole('link', { name: 'Markdown' }).click()
  await expect.poll(() => editorValue(page)).toBe('# Shared from here')
})

test('sharing with a password does not ask the person who shared it', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sealdown.author', 'Ana'))
  await page.goto('/')
  await editor(page).fill('# Locked')
  const panel = await openShare(page)
  await panel.getByLabel('Password for editing together').fill('pw')
  await panel.getByRole('button', { name: 'Share to edit' }).click()
  await expect(page).toHaveURL(/#\/n\//)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Unseal' })).toHaveCount(0)
  await expect(liveBar(page)).toContainText('v1')
})

test("others' saves arrive at once through Realtime, in the editor and on the read link", async ({ page, browser }) => {
  await page.addInitScript(() => localStorage.setItem('sealdown.author', 'Ana'))
  await page.goto('/')
  await editor(page).fill('one\ntwo')
  await (await openShare(page)).getByRole('button', { name: 'Share to edit' }).click()
  const dialog = page.getByRole('dialog', { name: 'Shared for editing' })
  const edit = await dialog.getByTestId('live-edit-url').inputValue()
  const read = await dialog.getByTestId('live-read-url').inputValue()
  await page.keyboard.press('Escape')
  await deaf(page)
  const reader = await page.context().newPage()
  await deaf(reader)
  await reader.goto(read)
  await expect(reader.getByText('two')).toBeVisible()

  const other = await browser.newContext()
  await other.addInitScript(() => localStorage.setItem('sealdown.author', 'Bob'))
  const bob = await other.newPage()
  await bob.goto(edit)
  await expect.poll(() => editorValue(bob)).toBe('one\ntwo')
  await editor(bob).fill('one\ntwo\nthree')
  await expect(liveBar(bob)).toContainText('v2', { timeout: 6000 })

  await expect.poll(() => editorValue(page), FAST).toBe('one\ntwo\nthree')
  await expect(reader.getByText('three')).toBeVisible(FAST)
  await other.close()
})

test('an editor whose fetch of a new version fails tries again soon', async ({ page, browser }) => {
  await page.addInitScript(() => localStorage.setItem('sealdown.author', 'Ana'))
  await page.goto('/')
  await editor(page).fill('one')
  await (await openShare(page)).getByRole('button', { name: 'Share to edit' }).click()
  const edit = await page.getByRole('dialog', { name: 'Shared for editing' }).getByTestId('live-edit-url').inputValue()
  await page.keyboard.press('Escape')
  await expect(liveBar(page)).toContainText('v1')
  await deaf(page)
  await page.route('**/rpc/get_live', (route) => route.abort())

  const other = await browser.newContext()
  await other.addInitScript(() => localStorage.setItem('sealdown.author', 'Bob'))
  const bob = await other.newPage()
  await bob.goto(edit)
  await expect.poll(() => editorValue(bob)).toBe('one')
  await editor(bob).fill('one\ntwo')
  await expect(liveBar(bob)).toContainText('v2', { timeout: 6000 })
  await page.waitForTimeout(1500)
  await page.unroute('**/rpc/get_live')
  await expect.poll(() => editorValue(page), { timeout: 8000 }).toBe('one\ntwo')
  await other.close()
})
