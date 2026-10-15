import { expect, test, type Page } from '@playwright/test'

const editor = (page: Page) => page.getByRole('textbox', { name: /Paste or type Markdown/ })

async function protectedLink(page: Page, text: string, password: string): Promise<string> {
  await page.goto('/')
  await editor(page).fill(text)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Seal link' }).click()
  return page.getByTestId('share-url').inputValue()
}

test('an empty password seals without protection; a password protects', async ({ page }) => {
  await page.goto('/')
  await editor(page).fill('# Secret')
  await page.getByRole('button', { name: 'Seal link' }).click()
  await expect(page.getByTestId('share-url')).toHaveValue(/#\/e\//)
  await page.keyboard.press('Escape')
  await page.getByLabel('Password', { exact: true }).fill('pw')
  await page.getByRole('button', { name: 'Seal link' }).click()
  await expect(page.getByTestId('share-url')).toHaveValue(/#\/p\//)
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
