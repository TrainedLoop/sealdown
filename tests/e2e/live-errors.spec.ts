import { expect, test, type Page } from '@playwright/test'
import { editorValue } from './helpers.ts'

// Runs against the local Supabase (scripts/e2e-stored.sh).

const editor = (page: Page) => page.getByRole('textbox', { name: /Paste or type Markdown/ })
const secret = 'LIVE SECRET NOTES 7c1e'

async function share(page: Page, text: string): Promise<{ edit: string; read: string }> {
  await page.addInitScript(() => localStorage.setItem('sealdown.author', 'Ana'))
  await page.goto('/')
  await editor(page).fill(text)
  await page.getByRole('button', { name: 'Share to edit' }).click()
  const result = {
    edit: await page.getByTestId('live-edit-url').inputValue(),
    read: await page.getByTestId('live-read-url').inputValue(),
  }
  await page.keyboard.press('Escape')
  return result
}

const failSave = (page: Page, code: string) =>
  page.route('**/rpc/save_version', (route) =>
    route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code, details: null, hint: null, message: 'x' }) }),
  )

test('a version over 1 MB is explained', async ({ page }) => {
  const { edit } = await share(page, 'small')
  await page.goto(edit)
  await failSave(page, '23514')
  await editor(page).fill('bigger')
  await page.getByRole('button', { name: 'Save version' }).click()
  await expect(page.getByRole('alert')).toHaveText('This version is larger than 1 MB.')
})

test('a full database keeps the draft', async ({ page }) => {
  const { edit } = await share(page, 'small')
  await page.goto(edit)
  await failSave(page, '53100')
  await editor(page).fill('kept')
  await page.getByRole('button', { name: 'Save version' }).click()
  await expect(page.getByRole('alert')).toHaveText("Can't save right now. Your changes are kept in this browser.")
})

test('a failed connection keeps the draft, even after a reload', async ({ page }) => {
  const { edit } = await share(page, 'small')
  await page.goto(edit)
  await page.route('**/rpc/save_version', (route) => route.abort())
  await editor(page).fill('kept offline')
  await page.getByRole('button', { name: 'Save version' }).click()
  await expect(page.getByRole('alert')).toHaveText("Couldn't save. Your changes are kept in this browser.")
  await page.unroute('**/rpc/save_version')
  await page.reload()
  await expect.poll(() => editorValue(page)).toBe('kept offline')
})

test('a removed document says so on both links', async ({ page }) => {
  const { edit, read } = await share(page, 'gone')
  await page.route('**/rpc/get_live', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  for (const url of [edit, read]) {
    await page.goto(url)
    await expect(page.getByRole('alert')).toContainText('This document was removed.')
  }
})

test('analytics see live events but never the token or the text', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false })
    Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined })
  })
  const bodies: string[] = []
  await page.route('**/ph/**', async (route) => {
    bodies.push(route.request().postData() ?? '')
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":1}' })
  })
  const { edit } = await share(page, `# ${secret}`)
  await page.goto(edit)
  await editor(page).fill(`# ${secret}\n\nmore`)
  await page.getByRole('button', { name: 'Save version' }).click()
  await expect(page.getByRole('region', { name: 'Live document' })).toContainText('v2')
  await expect.poll(() => bodies.join('\n'), { timeout: 15_000 }).toContain('version_saved')
  const sent = bodies.join('\n')
  const token = edit.split('.').at(-1)!
  expect(sent).toContain('live_created')
  expect(sent).toMatch(/"event":"live_opened"[\s\S]*?"access":"edit"/)
  expect(sent).not.toContain(token)
  expect(sent).not.toContain(secret)
  expect(sent).not.toContain('Ana')
})
