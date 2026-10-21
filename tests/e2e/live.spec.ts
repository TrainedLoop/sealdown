import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { editorValue, jsonText, setJsonText } from './helpers.ts'

// Runs against the local Supabase (scripts/e2e-stored.sh): live documents need storage.

const editor = (page: Page) => page.getByRole('textbox', { name: /Paste or type Markdown/ })
const liveBar = (page: Page) => page.getByRole('region', { name: 'Live document' })

async function share(page: Page, text: string): Promise<{ edit: string; read: string }> {
  await page.goto('/')
  await editor(page).fill(text)
  await page.getByRole('button', { name: 'Share to edit' }).click()
  const dialog = page.getByRole('dialog', { name: 'Shared for editing' })
  const edit = await dialog.getByTestId('live-edit-url').inputValue()
  const read = await dialog.getByTestId('live-read-url').inputValue()
  return { edit, read }
}

async function saveAs(page: Page, name?: string) {
  await page.getByRole('button', { name: 'Save version' }).click()
  if (name) {
    const prompt = page.getByRole('dialog', { name: 'Your name' })
    await prompt.getByRole('textbox').fill(name)
    await prompt.getByRole('button', { name: 'Save' }).click()
  }
}

async function openIn(context: BrowserContext, url: string): Promise<Page> {
  const page = await context.newPage()
  await page.goto(url)
  return page
}

test('Share to edit gives an edit link and a read link', async ({ page, context }) => {
  const { edit, read } = await share(page, '# Plan\n\nfirst')
  expect(edit).toMatch(/#\/w\/[A-Za-z0-9]{10}\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/)
  expect(read).toBe(edit.replace('#/w/', '#/l/').replace(/\.[A-Za-z0-9_-]{43}$/, ''))

  const editor1 = await openIn(context, edit)
  await expect(liveBar(editor1)).toContainText('v1')
  await expect.poll(() => editorValue(editor1)).toBe('# Plan\n\nfirst')
  await editor(editor1).fill('# Plan\n\nsecond')
  await saveAs(editor1, 'Ana')
  await expect(liveBar(editor1)).toContainText('v2')
  await expect(liveBar(editor1)).toContainText('Ana')

  const reader = await openIn(context, read)
  await expect(reader.getByText('second')).toBeVisible()
  await expect(liveBar(reader)).toContainText('v2')
  await expect(reader.getByRole('button', { name: 'Save version' })).toHaveCount(0)
})

test('the page shows when someone else saves, and Update brings it in', async ({ page, context }) => {
  const { edit } = await share(page, 'one\ntwo\nthree')
  const ana = await context.newPage()
  await ana.clock.install()
  await ana.goto(edit)
  await expect(liveBar(ana)).toContainText('v1')

  const bob = await openIn(context, edit)
  await expect.poll(() => editorValue(bob)).toBe('one\ntwo\nthree')
  await editor(bob).fill('one\ntwo\nTHREE')
  await saveAs(bob, 'Bob')
  await expect(liveBar(bob)).toContainText('v2')

  await ana.clock.fastForward('00:35')
  await expect(liveBar(ana)).toContainText('Bob saved v2')
  await liveBar(ana).getByRole('button', { name: 'Update' }).click()
  await expect.poll(() => editorValue(ana)).toBe('one\ntwo\nTHREE')
  await expect(liveBar(ana)).toContainText('v2')
})

test('saving after someone else merges both changes', async ({ page, context }) => {
  const { edit } = await share(page, 'one\ntwo\nthree')
  const ana = await openIn(context, edit)
  const bob = await openIn(context, edit)
  await expect.poll(() => editorValue(ana)).toBe('one\ntwo\nthree')
  await expect.poll(() => editorValue(bob)).toBe('one\ntwo\nthree')
  await editor(ana).fill('ONE\ntwo\nthree')
  await editor(bob).fill('one\ntwo\nTHREE')
  await saveAs(bob, 'Bob')
  await expect(liveBar(bob)).toContainText('v2')
  // Ana's typed text stays on her screen while Bob saves.
  await expect.poll(() => editorValue(ana)).toBe('ONE\ntwo\nthree')
  // Same browser as Bob's tab, so the name is already known.
  await saveAs(ana)
  await expect(liveBar(ana)).toContainText('v3')
  await expect.poll(() => editorValue(ana)).toBe('ONE\ntwo\nTHREE')
})

test('Ctrl/Cmd+S saves a version', async ({ page, context }) => {
  const { edit } = await share(page, 'draft')
  const ana = await openIn(context, edit)
  await editor(ana).fill('draft 2')
  await ana.keyboard.press('ControlOrMeta+s')
  await ana.getByRole('dialog', { name: 'Your name' }).getByRole('textbox').fill('Ana')
  await ana.getByRole('dialog', { name: 'Your name' }).getByRole('button', { name: 'Save' }).click()
  await expect(liveBar(ana)).toContainText('v2')
})

test('JSON documents are shared for editing too', async ({ page, context }) => {
  await page.goto('/#/json')
  await setJsonText(page, '{"k": 1}')
  await page.getByRole('button', { name: 'Share to edit' }).click()
  const edit = await page.getByTestId('live-edit-url').inputValue()
  const ana = await openIn(context, edit)
  await expect.poll(() => jsonText(ana)).toBe('{"k": 1}')
  await setJsonText(ana, '{"k": 2}')
  await saveAs(ana, 'Ana')
  await expect(liveBar(ana)).toContainText('v2')
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
