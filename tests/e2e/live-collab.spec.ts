import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { editorValue, openShare } from './helpers.ts'

// Runs against the local Supabase (scripts/e2e-stored.sh), Realtime included.

const editor = (page: Page) => page.getByRole('textbox', { name: /Paste or type Markdown/ })
const liveBar = (page: Page) => page.getByRole('region', { name: 'Live document' })
const SOON = { timeout: 5000 }

async function as(context: BrowserContext, name: string) {
  await context.addInitScript((n) => localStorage.setItem('sealdown.author', n), name)
}

/** Ana shares `text`; her tab becomes the edit page. */
async function share(page: Page, text: string, password = ''): Promise<{ edit: string; read: string }> {
  await as(page.context(), 'Ana')
  await page.goto('/')
  await editor(page).fill(text)
  const panel = await openShare(page)
  if (password) await panel.getByLabel('Password for editing together').fill(password)
  await panel.getByRole('button', { name: 'Share to edit' }).click()
  const dialog = page.getByRole('dialog', { name: 'Shared for editing' })
  const links = { edit: await dialog.getByTestId('live-edit-url').inputValue(), read: await dialog.getByTestId('live-read-url').inputValue() }
  await page.keyboard.press('Escape')
  await expect.poll(() => editorValue(page)).toBe(text)
  return links
}

async function bob(browser: Browser, url: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext()
  await as(context, 'Bob')
  const page = await context.newPage()
  await page.goto(url)
  return { page, close: () => context.close() }
}

async function typeAtEnd(page: Page, text: string) {
  await editor(page).click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(text)
}

test('two people typing on the same line both keep what they typed', async ({ page, browser }) => {
  const { edit } = await share(page, 'Line:')
  const b = await bob(browser, edit)
  await expect.poll(() => editorValue(b.page)).toBe('Line:')
  await Promise.all([typeAtEnd(page, ' ana'), typeAtEnd(b.page, ' bob')])
  await expect.poll(async () => (await editorValue(page)) === (await editorValue(b.page)), SOON).toBe(true)
  const text = await editorValue(page)
  expect(text).toContain('ana')
  expect(text).toContain('bob')
  expect(text.startsWith('Line:')).toBe(true)
  await b.close()
})

test('each letter arrives while the other person types', async ({ page, browser }) => {
  const { edit } = await share(page, 'Start')
  const b = await bob(browser, edit)
  await expect.poll(() => editorValue(b.page)).toBe('Start')
  await typeAtEnd(b.page, ' typing')
  await expect.poll(() => editorValue(page), { timeout: 1500 }).toBe('Start typing')
  await b.close()
})

test("the other person's cursor shows with their name, and both are present", async ({ page, browser }) => {
  const { edit } = await share(page, 'Cursor test')
  const b = await bob(browser, edit)
  await typeAtEnd(b.page, '!')
  await expect(page.locator('.cm-ySelectionInfo', { hasText: 'Bob' })).toBeAttached(SOON)
  await expect(liveBar(page)).toContainText('Bob', SOON)
  await expect(liveBar(b.page)).toContainText('Ana', SOON)
  // Bob leaves the page: his cursor and name go at once.
  await b.page.goto('about:blank')
  await expect(liveBar(page)).not.toContainText('Bob', { timeout: 5000 })
  await expect(page.locator('.cm-ySelectionInfo', { hasText: 'Bob' })).toHaveCount(0)
  await b.close()
})

test('the read link follows within a second and is not shown as present', async ({ page, browser }) => {
  const { read } = await share(page, '# Notes')
  const reader = await browser.newContext()
  const r = await reader.newPage()
  await r.goto(read)
  await expect(r.getByRole('heading', { name: 'Notes' })).toBeVisible()
  await typeAtEnd(page, '\n\nfresh line')
  await expect(r.getByText('fresh line')).toBeVisible({ timeout: 1500 })
  await expect(liveBar(page)).not.toContainText('Bob')
  await reader.close()
})

test('edits made offline are sent when the connection returns', async ({ page, browser }) => {
  const { edit } = await share(page, 'base')
  const b = await bob(browser, edit)
  await expect.poll(() => editorValue(b.page)).toBe('base')
  await b.page.context().setOffline(true)
  await expect(liveBar(b.page)).toContainText('Offline', { timeout: 15_000 })
  await typeAtEnd(b.page, ' offline')
  await typeAtEnd(page, ' online')
  await b.page.context().setOffline(false)
  await expect(liveBar(b.page)).toContainText('Connected', { timeout: 30_000 })
  await expect.poll(async () => (await editorValue(page)) === (await editorValue(b.page)), { timeout: 15_000 }).toBe(true)
  expect(await editorValue(page)).toContain('offline')
  expect(await editorValue(page)).toContain('online')
  await b.close()
})

test('a document from before real-time editing opened in two places at once has its text once', async ({ page, browser }) => {
  // Shared as an older client would: no Yjs state.
  await page.route('**/rpc/create_live', async (route) => {
    const body = JSON.parse(route.request().postData()!)
    delete body.state
    await route.continue({ postData: JSON.stringify(body) })
  })
  const { edit } = await share(page, 'only once')
  const [x, y] = await Promise.all([bob(browser, edit), bob(browser, edit)])
  await typeAtEnd(x.page, '!')
  await expect.poll(async () => (await editorValue(x.page)) === (await editorValue(y.page)), SOON).toBe(true)
  expect(await editorValue(x.page)).toBe('only once!')
  await Promise.all([x.close(), y.close()])
})

test('two tabs of one browser edit together', async ({ page }) => {
  const { edit } = await share(page, 'tabs')
  const second = await page.context().newPage()
  await second.goto(edit)
  await expect.poll(() => editorValue(second)).toBe('tabs')
  await typeAtEnd(second, ' two')
  await expect.poll(() => editorValue(page), SOON).toBe('tabs two')
  await typeAtEnd(page, ' one')
  await expect.poll(() => editorValue(second), SOON).toBe('tabs two one')
})

test('the current state is saved: a page opened later starts from it', async ({ page, browser }) => {
  const { edit } = await share(page, 'saved')
  await typeAtEnd(page, ' state')
  await page.waitForTimeout(3000)
  await page.close()
  const later = await bob(browser, edit)
  await expect.poll(() => editorValue(later.page), SOON).toBe('saved state')
  await later.close()
})

test('a password document works in real time', async ({ page, browser }) => {
  const { edit } = await share(page, 'locked', 'pw')
  const b = await bob(browser, edit)
  await b.page.getByLabel('Password', { exact: true }).fill('pw')
  await b.page.getByRole('button', { name: 'Unseal' }).click()
  await expect.poll(() => editorValue(b.page)).toBe('locked')
  await typeAtEnd(b.page, ' together')
  await expect.poll(() => editorValue(page), SOON).toBe('locked together')
  await b.close()
})

test('a named version lists everyone who edited, stays pinned, and restores for everyone', async ({ page, browser }) => {
  const { edit } = await share(page, 'first draft')
  const b = await bob(browser, edit)
  await expect.poll(() => editorValue(b.page)).toBe('first draft')
  await typeAtEnd(b.page, ' by bob')
  await expect.poll(() => editorValue(page), SOON).toBe('first draft by bob')

  await liveBar(page).getByRole('button', { name: 'Versions' }).click()
  const panel = page.getByRole('dialog', { name: 'Versions' })
  await panel.getByRole('button', { name: 'Mark version' }).click()
  await panel.getByLabel('Version name').fill('Approved')
  await panel.getByRole('button', { name: 'Save name' }).click()
  const named = panel.getByRole('listitem').filter({ hasText: 'Approved' })
  await expect(named).toBeVisible(SOON)
  await expect(named).toContainText('Ana')
  await expect(named).toContainText('Bob')
  await expect(panel.getByRole('listitem').first()).toContainText('Approved')
  await page.keyboard.press('Escape')

  await typeAtEnd(page, ' then changed')
  await expect.poll(() => editorValue(b.page), SOON).toBe('first draft by bob then changed')
  await liveBar(page).getByRole('button', { name: 'Versions' }).click()
  await panel.getByRole('button', { name: /Approved/ }).click()
  await panel.getByRole('button', { name: 'Restore this version' }).click()
  await expect.poll(() => editorValue(page), SOON).toBe('first draft by bob')
  await expect.poll(() => editorValue(b.page), SOON).toBe('first draft by bob')
  await b.close()
})

test('the read link can browse versions but not restore or mark them', async ({ page, browser }) => {
  const { read } = await share(page, 'readable')
  const reader = await browser.newContext()
  const r = await reader.newPage()
  await r.goto(read)
  await liveBar(r).getByRole('button', { name: 'Versions' }).click()
  const panel = r.getByRole('dialog', { name: 'Versions' })
  await expect(panel.getByRole('listitem')).toHaveCount(1)
  await expect(panel.getByRole('button', { name: 'Mark version' })).toHaveCount(0)
  await panel.getByRole('listitem').first().getByRole('button').click()
  await expect(r.getByRole('button', { name: 'Restore this version' })).toHaveCount(0)
  await reader.close()
})
