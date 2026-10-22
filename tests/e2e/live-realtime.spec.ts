import { expect, test, type Page } from '@playwright/test'
import { editorValue, openShare } from './helpers.ts'

// Runs against the local Supabase (scripts/e2e-stored.sh), Realtime included.

const editor = (page: Page) => page.getByRole('textbox', { name: /Paste or type Markdown/ })
const liveBar = (page: Page) => page.getByRole('region', { name: 'Live document' })

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
