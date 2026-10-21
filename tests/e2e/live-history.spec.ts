import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { editorValue } from './helpers.ts'

// Runs against the local Supabase (scripts/e2e-stored.sh).

const editor = (page: Page) => page.getByRole('textbox', { name: /Paste or type Markdown/ })
const liveBar = (page: Page) => page.getByRole('region', { name: 'Live document' })

async function share(page: Page, text: string): Promise<{ edit: string; read: string }> {
  await page.addInitScript(() => localStorage.setItem('sealdown.author', 'Ana'))
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

async function edits(page: Page, text: string, version: number) {
  await editor(page).fill(text)
  await page.getByRole('button', { name: 'Save version' }).click()
  await expect(liveBar(page)).toContainText(`v${version}`)
}

test('overlapping changes open the conflict dialog; the choice is saved', async ({ page, context }) => {
  const { edit } = await share(page, 'one\ntwo\nthree')
  const ana = await openIn(context, edit, 'one\ntwo\nthree')
  const bob = await openIn(context, edit, 'one\ntwo\nthree')
  await edits(bob, 'one\nbob\nthree', 2)
  await editor(ana).fill('one\nana\nthree')
  await ana.getByRole('button', { name: 'Save version' }).click()

  const dialog = ana.getByRole('dialog', { name: 'Changes that overlap' })
  await expect(dialog.getByRole('group', { name: 'line 2' })).toBeVisible()
  await expect(dialog.getByLabel('Your version')).toHaveText('ana')
  await expect(dialog.getByLabel('Their version')).toHaveText('bob')
  await dialog.getByRole('radio', { name: 'Theirs' }).check()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(liveBar(ana)).toContainText('v3')
  await expect.poll(() => editorValue(ana)).toBe('one\nbob\nthree')
})

test('cancelling a conflict keeps the draft unsaved', async ({ page, context }) => {
  const { edit } = await share(page, 'one\ntwo\nthree')
  const ana = await openIn(context, edit, 'one\ntwo\nthree')
  const bob = await openIn(context, edit, 'one\ntwo\nthree')
  await edits(bob, 'one\nbob\nthree', 2)
  await editor(ana).fill('one\nana\nthree')
  await ana.getByRole('button', { name: 'Save version' }).click()
  await ana.getByRole('dialog', { name: 'Changes that overlap' }).getByRole('button', { name: 'Cancel' }).click()
  await expect(ana.getByRole('dialog')).toHaveCount(0)
  await expect.poll(() => editorValue(ana)).toBe('one\nana\nthree')
  await expect(liveBar(ana)).toContainText('v1')
})

test('versions list, show their changes and restore', async ({ page, context }) => {
  const { edit, read } = await share(page, 'first')
  const ana = await openIn(context, edit, 'first')
  await edits(ana, 'second', 2)
  await edits(ana, 'third', 3)

  await liveBar(ana).getByRole('button', { name: 'Versions' }).click()
  const panel = ana.getByRole('dialog', { name: 'Versions' })
  const items = panel.getByRole('listitem')
  await expect(items).toHaveCount(3)
  await expect(items.nth(0)).toContainText('v3')
  await expect(items.nth(0)).toContainText('Ana')
  await panel.getByRole('button', { name: /^v1/ }).click()
  await expect(panel.locator('.diff-removed')).toHaveText(['first'])
  await expect(panel.locator('.diff-added')).toHaveText(['third'])
  await panel.getByRole('button', { name: 'Restore this version' }).click()
  await expect(liveBar(ana)).toContainText('v4')
  await expect.poll(() => editorValue(ana)).toBe('first')

  const reader = await openIn(context, read)
  await liveBar(reader).getByRole('button', { name: 'Versions' }).click()
  await reader.getByRole('dialog', { name: 'Versions' }).getByRole('button', { name: /^v2/ }).click()
  await expect(reader.getByRole('button', { name: 'Restore this version' })).toHaveCount(0)
})

test('typing on while a save merges keeps the other person change', async ({ page, context }) => {
  const { edit } = await share(page, 'a\nb\nc\nd\ne')
  const ana = await openIn(context, edit, 'a\nb\nc\nd\ne')
  const bob = await openIn(context, edit, 'a\nb\nc\nd\ne')
  await edits(bob, 'BOB\nb\nc\nd\ne', 2)
  // Slow saves on Ana's side, so she can keep typing while hers is merged and retried.
  await ana.route('**/rpc/save_version', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600))
    await route.continue()
  })
  await editor(ana).fill('a\nb\nc\nd\nANA')
  await ana.getByRole('button', { name: 'Save version' }).click()
  await editor(ana).press('ControlOrMeta+End')
  await ana.keyboard.type('\nmore')
  await expect(liveBar(ana)).toContainText('v3')
  await expect.poll(() => editorValue(ana)).toBe('BOB\nb\nc\nd\nANA\nmore')
  await ana.unroute('**/rpc/save_version')
  await ana.getByRole('button', { name: 'Save version' }).click()
  await expect(liveBar(ana)).toContainText('v4')
  const reader = await openIn(context, edit.replace('#/w/', '#/l/').replace(/\.[A-Za-z0-9_-]{43}$/, ''))
  await expect(reader.getByText('BOB')).toBeVisible()
})

test('restoring asks before replacing unsaved changes', async ({ page, context }) => {
  const { edit } = await share(page, 'first')
  const ana = await openIn(context, edit, 'first')
  await edits(ana, 'second', 2)
  await editor(ana).fill('unsaved work')
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
