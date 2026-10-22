import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { editorValue, jsonText, setJsonText, openShare } from './helpers.ts'

// Runs against the local Supabase (scripts/e2e-stored.sh): live documents need storage.
// Edits save on their own after a pause, and others' versions arrive within a poll (5 s).

const editor = (page: Page) => page.getByRole('textbox', { name: /Paste or type Markdown/ })
const liveBar = (page: Page) => page.getByRole('region', { name: 'Live document' })
const ARRIVES = { timeout: 12_000 }

async function share(page: Page, text: string): Promise<{ edit: string; read: string }> {
  await page.goto('/')
  await editor(page).fill(text)
  await (await openShare(page)).getByRole('button', { name: 'Share to edit' }).click()
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

test('Share to edit gives an edit link and a read link; edits reach the read link', async ({ page, context }) => {
  const { edit, read } = await share(page, '# Plan\n\nfirst')
  expect(edit).toMatch(/#\/w\/[A-Za-z0-9]{10}\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/)
  expect(read).toBe(edit.replace('#/w/', '#/l/').replace(/\.[A-Za-z0-9_-]{43}$/, ''))

  const ana = await openEdit(context, edit, 'Ana')
  await expect(liveBar(ana)).toContainText('Connected', ARRIVES)
  await expect.poll(() => editorValue(ana)).toBe('# Plan\n\nfirst')
  await expect(ana.getByRole('button', { name: 'Save version' })).toHaveCount(0)
  const reader = await openIn(context, read)
  await expect(reader.getByText('first')).toBeVisible()
  await editor(ana).fill('# Plan\n\nsecond')
  await expect(reader.getByText('second')).toBeVisible(ARRIVES)
})

test('Ctrl/Cmd+S saves right away', async ({ page, context }) => {
  const { edit } = await share(page, 'draft')
  const ana = await openEdit(context, edit, 'Ana')
  await expect.poll(() => editorValue(ana)).toBe('draft')
  await editor(ana).fill('draft 2')
  await ana.keyboard.press('ControlOrMeta+s')
  await ana.waitForTimeout(500)
  // Gone before the 2 s autosave: the save already happened.
  await ana.close({ runBeforeUnload: false })
  await page.close()
  const later = await openIn(await context.browser()!.newContext(), edit)
  await expect.poll(() => editorValue(later), ARRIVES).toBe('draft 2')
})

test('JSON documents are shared for editing too', async ({ page, context }) => {
  await page.goto('/#/json')
  await setJsonText(page, '{"k": 1}')
  await (await openShare(page)).getByRole('button', { name: 'Share to edit' }).click()
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
      await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeVisible()
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

for (const [width, max] of [[1280, 34], [390, 34]] as const) {
  test(`at ${width}px the live bar is one slim line`, async ({ page, context }) => {
    const { edit } = await share(page, '# Slim')
    const ana = await openEdit(context, edit, 'Ana')
    await ana.setViewportSize({ width, height: 800 })
    await expect(liveBar(ana)).toContainText('v1')
    const box = (await liveBar(ana).boundingBox())!
    expect(box.height).toBeLessThanOrEqual(max)
    await expect(liveBar(ana).getByRole('button', { name: 'Versions' })).toBeInViewport()
  })
}
