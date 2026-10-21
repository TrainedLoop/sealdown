import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { editorValue, jsonText, setJsonText } from './helpers.ts'

// Runs against the local Supabase (scripts/e2e-stored.sh): live documents need storage.
// Edits save on their own after a pause, and others' versions arrive within a poll (5 s).

const editor = (page: Page) => page.getByRole('textbox', { name: /Paste or type Markdown/ })
const liveBar = (page: Page) => page.getByRole('region', { name: 'Live document' })
const ARRIVES = { timeout: 12_000 }

async function share(page: Page, text: string): Promise<{ edit: string; read: string }> {
  await page.goto('/')
  await editor(page).fill(text)
  await page.getByRole('button', { name: 'Share to edit' }).click()
  const dialog = page.getByRole('dialog', { name: 'Shared for editing' })
  const edit = await dialog.getByTestId('live-edit-url').inputValue()
  const read = await dialog.getByTestId('live-read-url').inputValue()
  return { edit, read }
}

/** Opens the edit link as `name` (asked once per browser). */
async function openEdit(context: BrowserContext, url: string, name?: string): Promise<Page> {
  const page = await context.newPage()
  await page.goto(url)
  if (name) {
    const prompt = page.getByRole('dialog', { name: 'Your name' })
    await prompt.getByRole('textbox').fill(name)
    await prompt.getByRole('button', { name: 'Save' }).click()
  }
  return page
}

async function openIn(context: BrowserContext, url: string): Promise<Page> {
  const page = await context.newPage()
  await page.goto(url)
  return page
}

test('Share to edit gives an edit link and a read link; edits save on their own', async ({ page, context }) => {
  const { edit, read } = await share(page, '# Plan\n\nfirst')
  expect(edit).toMatch(/#\/w\/[A-Za-z0-9]{10}\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/)
  expect(read).toBe(edit.replace('#/w/', '#/l/').replace(/\.[A-Za-z0-9_-]{43}$/, ''))

  const ana = await openEdit(context, edit, 'Ana')
  await expect(liveBar(ana)).toContainText('v1')
  await expect.poll(() => editorValue(ana)).toBe('# Plan\n\nfirst')
  await expect(ana.getByRole('button', { name: 'Save version' })).toHaveCount(0)
  await editor(ana).fill('# Plan\n\nsecond')
  await expect(liveBar(ana)).toContainText('Unsaved changes')
  await expect(liveBar(ana)).toContainText('v2', ARRIVES)
  await expect(liveBar(ana)).toContainText('Ana')
  await expect(liveBar(ana)).toContainText('Saved')

  const reader = await openIn(context, read)
  await expect(reader.getByText('second')).toBeVisible()
  await expect(liveBar(reader)).toContainText('v2')
})

test("others' versions arrive on their own, in the editor and on the read link", async ({ page, context, browser }) => {
  const { edit, read } = await share(page, 'one\ntwo\nthree')
  const ana = await openEdit(context, edit, 'Ana')
  await expect.poll(() => editorValue(ana)).toBe('one\ntwo\nthree')
  const reader = await openIn(context, read)

  const other = await browser.newContext()
  const bob = await openEdit(other, edit, 'Bob')
  await expect.poll(() => editorValue(bob)).toBe('one\ntwo\nthree')
  await editor(bob).fill('one\ntwo\nTHREE')
  await expect(liveBar(bob)).toContainText('v2', ARRIVES)

  await expect.poll(() => editorValue(ana), ARRIVES).toBe('one\ntwo\nTHREE')
  await expect(liveBar(ana)).toContainText('v2')
  await expect(reader.getByText('THREE')).toBeVisible(ARRIVES)
  await other.close()
})

test('two people typing in different places both keep their changes', async ({ page, context, browser }) => {
  const { edit } = await share(page, 'one\ntwo\nthree\nfour\nfive')
  const ana = await openEdit(context, edit, 'Ana')
  const other = await browser.newContext()
  const bob = await openEdit(other, edit, 'Bob')
  await expect.poll(() => editorValue(ana)).toBe('one\ntwo\nthree\nfour\nfive')
  await expect.poll(() => editorValue(bob)).toBe('one\ntwo\nthree\nfour\nfive')
  await editor(ana).fill('ONE\ntwo\nthree\nfour\nfive')
  await editor(bob).fill('one\ntwo\nthree\nfour\nFIVE')
  const both = 'ONE\ntwo\nthree\nfour\nFIVE'
  await expect.poll(() => editorValue(ana), ARRIVES).toBe(both)
  await expect.poll(() => editorValue(bob), ARRIVES).toBe(both)
  await other.close()
})

test('the cursor stays where the person types when others change another part', async ({ page, context, browser }) => {
  const { edit } = await share(page, 'top\n\nmiddle\n\nbottom')
  const ana = await openEdit(context, edit, 'Ana')
  await expect.poll(() => editorValue(ana)).toBe('top\n\nmiddle\n\nbottom')
  const other = await browser.newContext()
  const bob = await openEdit(other, edit, 'Bob')
  await expect.poll(() => editorValue(bob)).toBe('top\n\nmiddle\n\nbottom')
  await editor(bob).fill('TOP FROM BOB\n\nmiddle\n\nbottom')
  await expect(liveBar(bob)).toContainText('v2', ARRIVES)

  // Ana's cursor at the end of "bottom" before Bob's version arrives.
  await editor(ana).click()
  await ana.keyboard.press('ControlOrMeta+End')
  await expect.poll(() => editorValue(ana), ARRIVES).toContain('TOP FROM BOB')
  await ana.keyboard.type('!')
  await expect.poll(() => editorValue(ana)).toBe('TOP FROM BOB\n\nmiddle\n\nbottom!')
  await other.close()
})

test('Ctrl/Cmd+S saves right away', async ({ page, context }) => {
  const { edit } = await share(page, 'draft')
  const ana = await openEdit(context, edit, 'Ana')
  await expect.poll(() => editorValue(ana)).toBe('draft')
  await editor(ana).fill('draft 2')
  await ana.keyboard.press('ControlOrMeta+s')
  await expect(liveBar(ana)).toContainText('v2', { timeout: 1000 })
})

test('JSON documents are shared for editing too', async ({ page, context }) => {
  await page.goto('/#/json')
  await setJsonText(page, '{"k": 1}')
  await page.getByRole('button', { name: 'Share to edit' }).click()
  const edit = await page.getByTestId('live-edit-url').inputValue()
  const ana = await openEdit(context, edit, 'Ana')
  await expect.poll(() => jsonText(ana)).toBe('{"k": 1}')
  await setJsonText(ana, '{"k": 2}')
  await expect(liveBar(ana)).toContainText('v2', ARRIVES)
})

for (const width of [320, 375]) {
  test(`at ${width}px Share to edit leaves the header in two rows and stays in the palette`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 })
    for (const hash of ['/', '/#/json']) {
      await page.goto(hash)
      await expect(page.getByRole('button', { name: 'Seal link' })).toBeVisible()
      expect((await page.locator('.app-header').boundingBox())!.height).toBeLessThanOrEqual(110)
    }
    await page.goto('/')
    await editor(page).fill('# Phone')
    await page.getByRole('button', { name: 'Command palette' }).click()
    await page.keyboard.type('Share to edit')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('live-edit-url')).toHaveValue(/#\/w\//)
  })
}
