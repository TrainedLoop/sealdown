import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { editorValue, inlineHash, jsonInlineHash, jsonText, setJsonText, openShare } from './helpers.ts'

const viewer = (page: Page) => page.locator('.json-reader')

async function sealJson(page: Page, json: string, password = ''): Promise<string> {
  await page.goto('/#/json')
  await setJsonText(page, json)
  if (password) await (await openShare(page)).getByLabel('Password', { exact: true }).fill(password)
  await (await openShare(page)).getByRole('button', { name: 'Seal link' }).click()
  return page.getByTestId('share-url').inputValue()
}

test('a sealed JSON link opens as a tree', async ({ page, context }) => {
  const url = await sealJson(page, '{"k":"v"}')
  expect(url).toMatch(/#\/e\//)
  const reader = await context.newPage()
  await reader.goto(url)
  await expect(viewer(reader).getByText('k', { exact: true })).toBeVisible()
  await expect(viewer(reader).getByText('v', { exact: true })).toBeVisible()
  await expect(reader.getByText('Unsealed only in this browser')).toBeVisible()
  await expect(reader.getByRole('button', { name: 'Present' })).toHaveCount(0)
  await expect(reader.getByRole('button', { name: 'Text style' })).toBeHidden()
})

test('a password-protected JSON link unseals to the tree', async ({ page, context }) => {
  const url = await sealJson(page, '{"secret":42}', 'pw')
  expect(url).toMatch(/#\/p\//)
  const reader = await context.newPage()
  await reader.goto(url)
  await reader.getByLabel('Password', { exact: true }).fill('pw')
  await reader.getByRole('button', { name: 'Unseal' }).click()
  await expect(viewer(reader).getByText('secret', { exact: true })).toBeVisible()
})

test('invalid JSON opens as text with the error marked', async ({ page }) => {
  await page.goto('/' + jsonInlineHash('{"a":'))
  await expect(viewer(page).locator('.cm-content')).toContainText('{"a":')
  await expect(viewer(page).locator('.jse-message.jse-error')).toBeVisible()
})

test('the JSON reader is read-only', async ({ page }) => {
  await page.goto('/' + jsonInlineHash('{"ro":1}'))
  await expect(viewer(page).getByText('ro', { exact: true })).toBeVisible()
  await expect(viewer(page).locator('.jse-main.jse-readonly, .jse-tree-mode.jse-readonly, .jse-readonly').first()).toBeAttached()
})

test('Markdown links still open as Markdown', async ({ page }) => {
  await page.goto('/' + inlineHash('# Title'))
  await expect(page.getByRole('heading', { level: 1, name: 'Title' })).toBeVisible()
  await expect(viewer(page)).toHaveCount(0)
})

test('Edit a copy of JSON goes to the JSON editor and leaves the Markdown draft alone', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('sealdown.draft', '# keep')
      sessionStorage.setItem('seeded', '1')
    }
  })
  await page.goto('/' + jsonInlineHash('{"copy":true}'))
  await page.getByRole('button', { name: 'Edit a copy' }).click()
  await expect(page).toHaveURL(/#\/json$/)
  await expect.poll(() => jsonText(page)).toBe('{"copy":true}')
  await page.getByRole('link', { name: 'Markdown' }).click()
  await expect.poll(() => editorValue(page)).toBe('# keep')
})

test('Edit a copy asks before replacing a different JSON draft', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sealdown.draft.json', '{"mine":1}'))
  await page.goto('/' + jsonInlineHash('{"theirs":1}'))
  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain('JSON draft')
    void dialog.dismiss()
  })
  await page.getByRole('button', { name: 'Edit a copy' }).click()
  await expect(page).not.toHaveURL(/#\/json$/)
})

test('the JSON reader downloads .json', async ({ page }) => {
  const json = '{"d":[1,2]}'
  await page.goto('/' + jsonInlineHash(json))
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: 'Download .json' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('document.json')
  expect(await readFile(await file.path(), 'utf8')).toBe(json)
})
