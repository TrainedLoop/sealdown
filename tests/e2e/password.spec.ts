import { expect, test, type Page } from '@playwright/test'

const editor = (page: Page) => page.getByRole('textbox', { name: /Paste or type Markdown/ })

async function protectedLink(page: Page, text: string, password: string): Promise<string> {
  await page.goto('/')
  await editor(page).fill(text)
  await page.getByRole('checkbox', { name: 'Protect with password' }).check()
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Generate link' }).click()
  return page.getByTestId('share-url').inputValue()
}

test('generate is disabled until a password is typed', async ({ page }) => {
  await page.goto('/')
  await editor(page).fill('# Secret')
  await page.getByRole('checkbox', { name: 'Protect with password' }).check()
  await expect(page.getByRole('button', { name: 'Generate link' })).toBeDisabled()
  await page.getByLabel('Password', { exact: true }).fill('pw')
  await expect(page.getByRole('button', { name: 'Generate link' })).toBeEnabled()
})

test('a protected link asks for the password', async ({ page, context }) => {
  const url = await protectedLink(page, '# Board notes\n\nConfidential.', 'hunter2')
  expect(url).toMatch(/#\/p\/[A-Za-z0-9_-]+$/)

  const reader = await context.newPage()
  await reader.goto(url)
  await expect(reader.getByText('This document is protected')).toBeVisible()
  await expect(reader.getByRole('heading', { name: 'Board notes' })).toHaveCount(0)

  await reader.getByLabel('Password', { exact: true }).fill('wrong')
  await reader.getByRole('button', { name: 'Open' }).click()
  await expect(reader.getByRole('alert')).toContainText('Wrong password')

  await reader.getByLabel('Password', { exact: true }).fill('hunter2')
  await reader.getByRole('button', { name: 'Open' }).click()
  await expect(reader.getByRole('heading', { name: 'Board notes' })).toBeVisible()
})

test('a corrupted protected link says so instead of asking for a password', async ({ page }) => {
  await page.goto('/#/p/AAAA')
  await expect(page.getByRole('alert')).toContainText('This link looks incomplete')
})
