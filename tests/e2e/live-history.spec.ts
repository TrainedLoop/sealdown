import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { editorValue } from './helpers.ts'

// Runs against the local Supabase (scripts/e2e-stored.sh).

const editor = (page: Page) => page.getByRole('textbox', { name: /Paste or type Markdown/ })
const liveBar = (page: Page) => page.getByRole('region', { name: 'Live document' })
const ARRIVES = { timeout: 12_000 }

async function as(context: BrowserContext, name: string) {
  await context.addInitScript((n) => localStorage.setItem('sealdown.author', n), name)
}

async function share(page: Page, text: string): Promise<{ edit: string; read: string }> {
  await as(page.context(), 'Ana')
  await page.goto('/')
  await editor(page).fill(text)
  await page.getByRole('button', { name: 'Share to edit' }).click()
  return {
    edit: await page.getByTestId('live-edit-url').inputValue(),
    read: await page.getByTestId('live-read-url').inputValue(),
  }
}

async function openIn(context: BrowserContext, url: string, text?: string): Promise<Page> {
  const page = await context.newPage()
  await page.goto(url)
  if (text !== undefined) await expect.poll(() => editorValue(page)).toBe(text)
  return page
}

/** Bob, in a browser of his own (his own writer id, so his versions never collapse into Ana's). */
async function bobOpens(browser: Browser, url: string, text: string): Promise<{ bob: Page; close: () => Promise<void> }> {
  const context = await browser.newContext()
  await as(context, 'Bob')
  return { bob: await openIn(context, url, text), close: () => context.close() }
}

/** Keeps a page from hearing about newer versions, so its next save meets them as stale. */
async function deaf(page: Page) {
  await page.route('**/rpc/live_head', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '1' }))
}

test('overlapping changes wait for a choice, and the choice is saved', async ({ page, context, browser }) => {
  const { edit } = await share(page, 'one\ntwo\nthree')
  const ana = await openIn(context, edit, 'one\ntwo\nthree')
  await deaf(ana)
  const { bob, close } = await bobOpens(browser, edit, 'one\ntwo\nthree')
  await editor(bob).fill('one\nbob\nthree')
  await expect(liveBar(bob)).toContainText('v2', ARRIVES)

  await editor(ana).fill('one\nana\nthree')
  await expect(liveBar(ana)).toContainText('1 part changed by you and someone else', ARRIVES)
  await liveBar(ana).getByRole('button', { name: 'Resolve' }).click()
  const dialog = ana.getByRole('dialog', { name: 'Changes that overlap' })
  // Each side shows what it changed from the original, with the lines around it.
  const mine = dialog.getByRole('region', { name: 'Your change' })
  await expect(mine.locator('.diff-removed')).toHaveText(['two'])
  await expect(mine.locator('.diff-added')).toHaveText(['ana'])
  await expect(mine.locator('.diff-same')).toHaveText(['one', 'three'])
  const theirs = dialog.getByRole('region', { name: 'Their change' })
  await expect(theirs.locator('.diff-added')).toHaveText(['bob'])
  // The preview follows the choice.
  const result = dialog.getByRole('region', { name: 'Result' })
  await expect(result.locator('.diff-added')).toHaveText(['ana'])
  await dialog.getByRole('radio', { name: 'Both' }).check()
  await expect(result.locator('.diff-added')).toHaveText(['ana', 'bob'])
  await dialog.getByRole('radio', { name: 'Theirs' }).check()
  await expect(result.locator('.diff-added')).toHaveText(['bob'])
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(liveBar(ana)).toContainText('v3', ARRIVES)
  await expect.poll(() => editorValue(ana)).toBe('one\nbob\nthree')
  await close()
})

test('closing the conflict dialog keeps the text and holds saving until it is resolved', async ({ page, context, browser }) => {
  const { edit } = await share(page, 'one\ntwo\nthree')
  const ana = await openIn(context, edit, 'one\ntwo\nthree')
  await deaf(ana)
  const { bob, close } = await bobOpens(browser, edit, 'one\ntwo\nthree')
  await editor(bob).fill('one\nbob\nthree')
  await expect(liveBar(bob)).toContainText('v2', ARRIVES)
  await editor(ana).fill('one\nana\nthree')
  await liveBar(ana).getByRole('button', { name: 'Resolve' }).click(ARRIVES)
  await ana.getByRole('dialog', { name: 'Changes that overlap' }).getByRole('button', { name: 'Cancel' }).click()
  await expect(ana.getByRole('dialog')).toHaveCount(0)
  await ana.waitForTimeout(3000)
  await expect.poll(() => editorValue(ana)).toBe('one\nana\nthree')
  await expect(liveBar(ana)).toContainText('v1')
  await expect(liveBar(ana).getByRole('button', { name: 'Resolve' })).toBeVisible()
  await close()
})

test('typing on while a save merges keeps the other person change', async ({ page, context, browser }) => {
  const { edit, read } = await share(page, 'a\nb\nc\nd\ne')
  const ana = await openIn(context, edit, 'a\nb\nc\nd\ne')
  await deaf(ana)
  const { bob, close } = await bobOpens(browser, edit, 'a\nb\nc\nd\ne')
  await editor(bob).fill('BOB\nb\nc\nd\ne')
  await expect(liveBar(bob)).toContainText('v2', ARRIVES)
  // Slow saves on Ana's side, so she keeps typing while hers is merged and retried.
  await ana.route('**/rpc/save_version', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800))
    await route.continue()
  })
  await editor(ana).fill('a\nb\nc\nd\nANA')
  await expect(liveBar(ana)).toContainText('Saving', ARRIVES)
  await editor(ana).press('ControlOrMeta+End')
  await ana.keyboard.type('\nmore')
  await expect.poll(() => editorValue(ana), ARRIVES).toBe('BOB\nb\nc\nd\nANA\nmore')
  const reader = await openIn(context, read)
  await expect(reader.getByText('more')).toBeVisible({ timeout: 20_000 })
  await expect(reader.getByText('BOB')).toBeVisible()
  await close()
})

test('versions list, show their changes and restore', async ({ page, context, browser }) => {
  const { edit, read } = await share(page, 'first')
  const ana = await openIn(context, edit, 'first')
  await editor(ana).fill('second')
  await expect(liveBar(ana)).toContainText('v2', ARRIVES)
  const { bob, close } = await bobOpens(browser, edit, 'second')
  await editor(bob).fill('third')
  await expect(liveBar(bob)).toContainText('v3', ARRIVES)
  await expect.poll(() => editorValue(ana), ARRIVES).toBe('third')

  await liveBar(ana).getByRole('button', { name: 'Versions' }).click()
  const panel = ana.getByRole('dialog', { name: 'Versions' })
  const items = panel.getByRole('listitem')
  await expect(items).toHaveCount(3)
  await expect(items.nth(0)).toContainText('v3')
  await expect(items.nth(0)).toContainText('Bob')
  await panel.getByRole('button', { name: /^v1/ }).click()
  await expect(panel.locator('.diff-removed')).toHaveText(['first'])
  await expect(panel.locator('.diff-added')).toHaveText(['third'])
  await panel.getByRole('button', { name: 'Restore this version' }).click()
  await expect(liveBar(ana)).toContainText('v4', ARRIVES)
  await expect.poll(() => editorValue(ana)).toBe('first')

  const reader = await openIn(context, read)
  await liveBar(reader).getByRole('button', { name: 'Versions' }).click()
  await reader.getByRole('dialog', { name: 'Versions' }).getByRole('button', { name: /^v2/ }).click()
  await expect(reader.getByRole('button', { name: 'Restore this version' })).toHaveCount(0)
  await close()
})

test('autosaves in a row by the same person keep one version', async ({ page, context }) => {
  const { edit } = await share(page, 'start')
  const ana = await openIn(context, edit, 'start')
  await editor(ana).fill('one')
  await expect(liveBar(ana)).toContainText('v2', ARRIVES)
  await editor(ana).fill('two')
  await expect(liveBar(ana)).toContainText('v3', ARRIVES)
  await liveBar(ana).getByRole('button', { name: 'Versions' }).click()
  await expect(ana.getByRole('dialog', { name: 'Versions' }).getByRole('listitem')).toHaveCount(2)
})

test('restoring asks before replacing unsaved changes', async ({ page, context }) => {
  const { edit } = await share(page, 'first')
  const ana = await openIn(context, edit, 'first')
  await editor(ana).fill('second')
  await expect(liveBar(ana)).toContainText('v2', ARRIVES)
  // Saving fails from now on, so the next edit stays unsaved.
  await ana.route('**/rpc/save_version', (route) => route.abort())
  await editor(ana).fill('unsaved work')
  await expect(ana.getByRole('alert')).toBeVisible(ARRIVES)
  await liveBar(ana).getByRole('button', { name: 'Versions' }).click()
  await ana.getByRole('dialog', { name: 'Versions' }).getByRole('button', { name: /^v1/ }).click()
  ana.once('dialog', (dialog) => void dialog.dismiss())
  await ana.getByRole('button', { name: 'Restore this version' }).click()
  // Declined: nothing is restored, the panel stays open and the text stays.
  await ana.waitForTimeout(1000)
  await expect(ana.getByRole('dialog', { name: 'Versions' })).toBeVisible()
  await expect(liveBar(ana)).toContainText('v2')
  await expect.poll(() => editorValue(ana)).toBe('unsaved work')
})

test('typing while a conflict waits is kept when it is resolved', async ({ page, context, browser }) => {
  const { edit } = await share(page, 'one\ntwo\nthree\n\nfar away')
  const ana = await openIn(context, edit, 'one\ntwo\nthree\n\nfar away')
  await deaf(ana)
  const { bob, close } = await bobOpens(browser, edit, 'one\ntwo\nthree\n\nfar away')
  await editor(bob).fill('one\nbob\nthree\n\nfar away')
  await expect(liveBar(bob)).toContainText('v2', ARRIVES)
  await editor(ana).fill('one\nana\nthree\n\nfar away')
  await expect(liveBar(ana).getByRole('button', { name: 'Resolve' })).toBeVisible(ARRIVES)
  // Keeps writing elsewhere while the conflict waits.
  await editor(ana).press('ControlOrMeta+End')
  await ana.keyboard.type(' and more')
  await liveBar(ana).getByRole('button', { name: 'Resolve' }).click()
  const dialog = ana.getByRole('dialog', { name: 'Changes that overlap' })
  await dialog.getByRole('radio', { name: 'Theirs' }).check()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect.poll(() => editorValue(ana), ARRIVES).toBe('one\nbob\nthree\n\nfar away and more')
  await expect(liveBar(ana)).toContainText('Saved', ARRIVES)
  await close()
})

test('a waiting conflict has to be resolved before restoring', async ({ page, context, browser }) => {
  const { edit } = await share(page, 'one\ntwo')
  const ana = await openIn(context, edit, 'one\ntwo')
  await deaf(ana)
  const { bob, close } = await bobOpens(browser, edit, 'one\ntwo')
  await editor(bob).fill('one\nbob')
  await expect(liveBar(bob)).toContainText('v2', ARRIVES)
  await editor(ana).fill('one\nana')
  await expect(liveBar(ana).getByRole('button', { name: 'Resolve' })).toBeVisible(ARRIVES)
  await liveBar(ana).getByRole('button', { name: 'Versions' }).click()
  await ana.getByRole('dialog', { name: 'Versions' }).getByRole('button', { name: /^v1/ }).click()
  await expect(ana.getByRole('dialog', { name: 'Versions' }).locator('.diff-view')).toBeVisible()
  await expect(ana.getByRole('button', { name: 'Restore this version' })).toHaveCount(0)
  await close()
})
