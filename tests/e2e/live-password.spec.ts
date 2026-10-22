import { expect, test, type Page } from '@playwright/test'
import { editorValue, openShare } from './helpers.ts'

// Runs against the local Supabase (scripts/e2e-stored.sh).

const editor = (page: Page) => page.getByRole('textbox', { name: /Paste or type Markdown/ })
const ARRIVES = { timeout: 12_000 }

async function shareWithPassword(page: Page, text: string, password: string) {
  await page.addInitScript(() => localStorage.setItem('sealdown.author', 'Ana'))
  await page.goto('/')
  await editor(page).fill(text)
  const panel = await openShare(page)
  await panel.getByLabel('Password for editing together').fill(password)
  await panel.getByRole('button', { name: 'Share to edit' }).click()
  const dialog = page.getByRole('dialog', { name: 'Shared for editing' })
  await expect(dialog).toContainText('Send the password through another channel')
  return {
    edit: await dialog.getByTestId('live-edit-url').inputValue(),
    read: await dialog.getByTestId('live-read-url').inputValue(),
  }
}

async function unseal(page: Page, password: string) {
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Unseal' }).click()
}

test('a password-protected live document keeps the key out of both links', async ({ page }) => {
  const { edit, read } = await shareWithPassword(page, '# Private plan', 'hunter2')
  expect(edit).toMatch(/#\/n\/[A-Za-z0-9]{10}\.[A-Za-z0-9_-]{43}$/)
  expect(read).toMatch(/#\/m\/[A-Za-z0-9]{10}$/)
})

test('the edit link asks for the password, then edits and saves; a reload in the same tab does not ask again', async ({ page, context }) => {
  const { edit } = await shareWithPassword(page, '# Private plan', 'hunter2')
  const ana = await context.newPage()
  await ana.goto(edit)
  await expect(ana.getByRole('heading', { name: 'Document sealed' })).toBeVisible()
  await unseal(ana, 'wrong')
  await expect(ana.getByRole('alert')).toContainText('Wrong password')
  await unseal(ana, 'hunter2')
  await expect.poll(() => editorValue(ana)).toBe('# Private plan')
  await editor(ana).fill('# Private plan\n\nmore')
  await ana.waitForTimeout(3000)
  await ana.reload()
  await expect.poll(() => editorValue(ana)).toBe('# Private plan\n\nmore')
})

test('the read link asks for the password and follows new versions', async ({ page, context }) => {
  const { edit, read } = await shareWithPassword(page, '# Shared notes', 'pw')
  const reader = await context.newPage()
  await reader.goto(read)
  await unseal(reader, 'pw')
  await expect(reader.getByRole('heading', { name: 'Shared notes' })).toBeVisible()
  const ana = await context.newPage()
  await ana.goto(edit)
  await unseal(ana, 'pw')
  await expect.poll(() => editorValue(ana)).toBe('# Shared notes')
  await editor(ana).fill('# Shared notes\n\nupdated')
  await expect(reader.getByText('updated')).toBeVisible(ARRIVES)
})

test('the read link copied from the edit page carries no key', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const { edit, read } = await shareWithPassword(page, '# Copy me', 'pw')
  const ana = await context.newPage()
  await ana.goto(edit)
  await unseal(ana, 'pw')
  await expect.poll(() => editorValue(ana)).toBe('# Copy me')
  await ana.getByRole('button', { name: 'Copy read link' }).click()
  expect(await ana.evaluate(() => navigator.clipboard.readText())).toBe(read)
})
