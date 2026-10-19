import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { editorValue, jsonText, setJsonText } from './helpers.ts'

const tree = (page: import('@playwright/test').Page) => page.locator('.json-tree')

test('the switch moves between Markdown and JSON', async ({ page }) => {
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Document type' })
  await expect(nav.getByRole('link', { name: 'Markdown' })).toHaveAttribute('aria-current', 'page')
  await nav.getByRole('link', { name: 'JSON' }).click()
  await expect(page).toHaveURL(/#\/json$/)
  await expect(nav.getByRole('link', { name: 'JSON' })).toHaveAttribute('aria-current', 'page')
  await nav.getByRole('link', { name: 'Markdown' }).click()
  await expect(page.getByRole('textbox', { name: /Paste or type Markdown/ })).toBeVisible()
})

test('a fresh JSON draft starts as an empty object', async ({ page }) => {
  await page.goto('/#/json')
  await expect.poll(() => jsonText(page)).toBe('{}')
})

test('editing the text updates the tree', async ({ page }) => {
  await page.goto('/#/json')
  await setJsonText(page, '{"name":"Ada","tags":[1,2]}')
  await expect(tree(page).getByText('name', { exact: true })).toBeVisible()
  await expect(tree(page).getByText('Ada')).toBeVisible()
})

test('editing the tree updates the text', async ({ page }) => {
  await page.goto('/#/json')
  await setJsonText(page, '{"name":"Ada"}')
  await tree(page).getByText('Ada').dblclick()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText('Grace')
  await page.keyboard.press('Enter')
  await expect.poll(() => jsonText(page)).toContain('Grace')
})

test('invalid JSON is reported', async ({ page }) => {
  await page.goto('/#/json')
  await setJsonText(page, '{"a":')
  await expect(page.locator('.json-text .jse-message.jse-error')).toBeVisible()
})

test('Markdown and JSON keep separate drafts', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('textbox', { name: /Paste or type Markdown/ }).fill('# md')
  await page.getByRole('link', { name: 'JSON' }).click()
  await setJsonText(page, '{"j":1}')
  await page.waitForTimeout(700)
  await page.goto('/#/')
  await page.reload()
  await expect.poll(() => editorValue(page)).toBe('# md')
  await page.getByRole('link', { name: 'JSON' }).click()
  await expect.poll(() => jsonText(page)).toBe('{"j":1}')
})

test('opens a .json file', async ({ page }) => {
  await page.goto('/#/json')
  await page.getByLabel('Open .json').setInputFiles({ name: 'data.json', mimeType: 'application/json', buffer: Buffer.from('{"x":1}') })
  await expect.poll(() => jsonText(page)).toBe('{"x":1}')
})

test('exports .json', async ({ page }) => {
  await page.goto('/#/json')
  await setJsonText(page, '{"e":true}')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: 'Download .json' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('document.json')
  expect(await readFile(await file.path(), 'utf8')).toBe('{"e":true}')
})

test('the text style menu is hidden on JSON pages', async ({ page }) => {
  await page.goto('/#/json')
  await expect(page.locator('.json-text')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Text style' })).toBeHidden()
})

test('phones switch between text and tree', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto('/#/json')
  await setJsonText(page, '{"phone":1}')
  await expect(tree(page)).toBeHidden()
  await page.getByRole('tab', { name: 'Tree' }).click()
  await expect(tree(page).getByText('phone', { exact: true })).toBeVisible()
  await expect(page.locator('.json-text')).toBeHidden()
  await page.getByRole('tab', { name: 'Text' }).click()
  await expect(page.locator('.json-text')).toBeVisible()
})

test('Seal link works from the JSON editor', async ({ page }) => {
  await page.goto('/#/json')
  await setJsonText(page, '{"k":"v"}')
  await page.getByRole('button', { name: 'Seal link' }).click()
  await expect(page.getByTestId('share-url')).toHaveValue(/#\/e\//)
})
