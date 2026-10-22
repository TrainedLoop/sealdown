import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { jsonText, openShare, setJsonText } from './helpers.ts'

// JSON live documents keep save-and-merge (Markdown ones are edited in real time: live-collab).
// Runs against the local Supabase (scripts/e2e-stored.sh).

const liveBar = (page: Page) => page.getByRole('region', { name: 'Live document' })
const ARRIVES = { timeout: 12_000 }

async function as(context: BrowserContext, name: string) {
  await context.addInitScript((n) => localStorage.setItem('sealdown.author', n), name)
}

async function share(page: Page, json: string): Promise<{ edit: string; read: string }> {
  await as(page.context(), 'Ana')
  await page.goto('/#/json')
  await setJsonText(page, json)
  await (await openShare(page)).getByRole('button', { name: 'Share to edit' }).click()
  const links = { edit: await page.getByTestId('live-edit-url').inputValue(), read: await page.getByTestId('live-read-url').inputValue() }
  await page.keyboard.press('Escape')
  return links
}

async function openIn(context: BrowserContext, url: string, json?: string): Promise<Page> {
  const page = await context.newPage()
  await page.goto(url)
  if (json !== undefined) await expect.poll(() => jsonText(page)).toBe(json)
  return page
}

async function bobOpens(browser: Browser, url: string, json: string) {
  const context = await browser.newContext()
  await as(context, 'Bob')
  return { bob: await openIn(context, url, json), close: () => context.close() }
}

/** Keeps a context from hearing about newer versions, so its next save meets them as stale. */
async function deaf(target: Page | BrowserContext) {
  await target.route('**/rpc/live_head', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '1' }))
  await target.routeWebSocket(/\/realtime\//, () => {
    // Never connected: no pushes reach this page.
  })
}

test("others' JSON saves arrive on their own and merge with separate changes", async ({ page, browser }) => {
  const { edit } = await share(page, '{"a": 1, "b": 1}')
  await expect.poll(() => jsonText(page)).toBe('{"a": 1, "b": 1}')
  const { bob, close } = await bobOpens(browser, edit, '{"a": 1, "b": 1}')
  await setJsonText(bob, '{"a": 1, "b": 2}')
  await expect(liveBar(bob)).toContainText('v2', ARRIVES)
  await expect.poll(async () => JSON.parse(await jsonText(page)), ARRIVES).toEqual({ a: 1, b: 2 })
  await close()
})

test('overlapping JSON changes wait for a choice, and the choice is saved', async ({ page, browser, context }) => {
  const { edit } = await share(page, '{"k": "base"}')
  await deaf(context)
  const ana = await openIn(context, edit, '{"k": "base"}')
  const { bob, close } = await bobOpens(browser, edit, '{"k": "base"}')
  await setJsonText(bob, '{"k": "bob"}')
  await expect(liveBar(bob)).toContainText('v2', ARRIVES)
  await setJsonText(ana, '{"k": "ana"}')
  await expect(liveBar(ana)).toContainText('1 part changed by you and someone else', ARRIVES)
  await liveBar(ana).getByRole('button', { name: 'Resolve' }).click()
  const dialog = ana.getByRole('dialog', { name: 'Changes that overlap' })
  await expect(dialog.getByRole('group', { name: '/k' })).toBeVisible()
  await dialog.getByRole('radio', { name: 'Theirs' }).check()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(liveBar(ana)).toContainText('v3', ARRIVES)
  await expect.poll(async () => JSON.parse(await jsonText(ana))).toEqual({ k: 'bob' })
  await close()
})

test('closing the conflict dialog keeps the text and holds saving until it is resolved', async ({ page, browser, context }) => {
  const { edit } = await share(page, '{"k": "base"}')
  await deaf(context)
  const ana = await openIn(context, edit, '{"k": "base"}')
  const { bob, close } = await bobOpens(browser, edit, '{"k": "base"}')
  await setJsonText(bob, '{"k": "bob"}')
  await expect(liveBar(bob)).toContainText('v2', ARRIVES)
  await setJsonText(ana, '{"k": "ana"}')
  await liveBar(ana).getByRole('button', { name: 'Resolve' }).click(ARRIVES)
  await ana.getByRole('dialog', { name: 'Changes that overlap' }).getByRole('button', { name: 'Cancel' }).click()
  await ana.waitForTimeout(3000)
  expect(JSON.parse(await jsonText(ana))).toEqual({ k: 'ana' })
  await expect(liveBar(ana)).toContainText('v1')
  await expect(liveBar(ana).getByRole('button', { name: 'Resolve' })).toBeVisible()
  await close()
})

test('a JSON read link refreshes on new saves and keeps its document when a refresh fails', async ({ page, browser }) => {
  const { edit, read } = await share(page, '{"shown": 1}')
  const readerContext = await browser.newContext()
  const reader = await openIn(readerContext, read)
  await expect(reader.locator('.json-reader').getByText('shown', { exact: true })).toBeVisible()
  await reader.route('**/rpc/get_state', (route) => route.abort())
  const { bob, close } = await bobOpens(browser, edit, '{"shown": 1}')
  await setJsonText(bob, '{"shown": 2}')
  await expect(liveBar(bob)).toContainText('v2', ARRIVES)
  await reader.waitForTimeout(2000)
  await expect(reader.locator('.json-reader').getByText('shown', { exact: true })).toBeVisible()
  await reader.unroute('**/rpc/get_state')
  await expect(reader.locator('.json-reader .jse-value').filter({ hasText: '2' }).first()).toBeVisible(ARRIVES)
  await readerContext.close()
  await close()
})
