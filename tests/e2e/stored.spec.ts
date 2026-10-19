import { expect, test, type Page } from '@playwright/test'
import { editorValue, setJsonText } from './helpers.ts'

const editor = (page: Page) => page.getByRole('textbox', { name: /Paste or type Markdown/ })

function largeDoc(title: string): string {
  const words = Array.from({ length: 4000 }, () => Math.random().toString(36).slice(2, 9))
  return `# ${title}\n\n${words.join(' ')}`
}

async function share(page: Page, text: string): Promise<string> {
  await page.goto('/')
  await editor(page).fill(text)
  await page.getByRole('button', { name: 'Seal link' }).click()
  return page.getByTestId('share-url').inputValue()
}

test('large document is stored and opens from a short link', async ({ page, context }) => {
  const url = await share(page, largeDoc('Stored doc'))
  expect(url).toMatch(/#\/s\/[A-Za-z0-9]{10}\.[A-Za-z0-9_-]{43}$/)
  await expect(page.getByRole('alert')).toHaveCount(0)
  const reader = await context.newPage()
  await reader.goto(url)
  await expect(reader.getByRole('heading', { name: 'Stored doc' })).toBeVisible()
})

test('editing a copy creates a new document and keeps the original', async ({ page, context }) => {
  const original = await share(page, largeDoc('First version'))
  await page.goto(original)
  await page.getByRole('button', { name: 'Edit a copy' }).click()
  await expect.poll(() => editorValue(page)).toContain('# First version')
  const text = await editorValue(page)
  await page.keyboard.press('Escape')
  await editor(page).fill(text.replace('# First version', '# Second version'))
  await page.getByRole('button', { name: 'Seal link' }).click()
  const copy = await page.getByTestId('share-url').inputValue()
  expect(copy).not.toBe(original)

  const reader = await context.newPage()
  await reader.goto(copy)
  await expect(reader.getByRole('heading', { name: 'Second version' })).toBeVisible()
  await reader.goto(original)
  await expect(reader.getByRole('heading', { name: 'First version' })).toBeVisible()
})

test('unknown id shows the expired message', async ({ page }) => {
  await page.goto(`/#/s/ZZZZZZZZZZ.${'A'.repeat(43)}`)
  await expect(page.getByRole('alert')).toContainText('This document has expired')
})

test('wrong key shows the incomplete-link message', async ({ page }) => {
  const url = await share(page, largeDoc('Secret'))
  const hash = url.slice(url.indexOf('#'))
  const keyStart = hash.indexOf('.') + 1
  // Change the first key character: the last one carries unused padding bits.
  const tampered = hash.slice(0, keyStart) + (hash[keyStart] === 'A' ? 'B' : 'A') + hash.slice(keyStart + 1)
  await page.goto('/' + tampered)
  await expect(page.getByRole('alert')).toContainText('This link looks incomplete')
})

test('network failure offers a retry that recovers', async ({ page }) => {
  const url = await share(page, largeDoc('Retry me'))
  await page.route('**/rest/v1/rpc/get_doc', (route) => route.abort())
  await page.goto(url)
  const alert = page.getByRole('alert')
  await expect(alert).toContainText("Couldn't load the document right now")
  await page.unroute('**/rest/v1/rpc/get_doc')
  await alert.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { name: 'Retry me' })).toBeVisible()
})

test('editing while a link is being generated discards the stale link', async ({ page }) => {
  await page.route('**/rest/v1/rpc/create_doc', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await route.continue()
  })
  await page.goto('/')
  await editor(page).fill(largeDoc('Old version'))
  await page.getByRole('button', { name: 'Seal link' }).click()
  await editor(page).fill(largeDoc('New version'))
  await page.waitForTimeout(2500)
  await expect(page.getByTestId('share-url')).toHaveCount(0)
})

test('an unexpected failure while generating shows a message', async ({ page }) => {
  await page.route('**/rest/v1/rpc/create_doc', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'not json' }),
  )
  await page.goto('/')
  await editor(page).fill(largeDoc('Broken'))
  await page.getByRole('button', { name: 'Seal link' }).click()
  await expect(page.getByRole('alert')).toContainText("Couldn't generate the link")
  await expect(page.getByRole('button', { name: 'Seal link' })).toBeEnabled()
})

test('a large protected document is stored and fetched once across password attempts', async ({ page, context }) => {
  await page.goto('/')
  await editor(page).fill(largeDoc('Locked'))
  await page.getByLabel('Password', { exact: true }).fill('s3cret')
  await page.getByRole('button', { name: 'Seal link' }).click()
  const url = await page.getByTestId('share-url').inputValue()
  expect(url).toMatch(/#\/q\/[A-Za-z0-9]{10}$/)

  const reader = await context.newPage()
  let fetches = 0
  reader.on('request', (r) => {
    if (r.url().includes('/rpc/get_doc')) fetches++
  })
  await reader.goto(url)
  await reader.getByLabel('Password', { exact: true }).fill('nope')
  await reader.getByRole('button', { name: 'Unseal' }).click()
  await expect(reader.getByRole('alert')).toContainText('Wrong password')
  await reader.getByLabel('Password', { exact: true }).fill('s3cret')
  await reader.getByRole('button', { name: 'Unseal' }).click()
  await expect(reader.getByRole('heading', { name: 'Locked' })).toBeVisible()
  expect(fetches).toBe(1)
})

test('protection settings are locked while a link is being generated', async ({ page }) => {
  await page.route('**/rest/v1/rpc/create_doc', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await route.continue()
  })
  await page.goto('/')
  await editor(page).fill(largeDoc('Racing'))
  await page.getByRole('button', { name: 'Seal link' }).click()
  await expect(page.getByLabel('Password', { exact: true })).toBeDisabled()
  await expect(page.getByTestId('share-url')).toHaveValue(/#\/s\//)
  await page.keyboard.press('Escape')
  await expect(page.getByLabel('Password', { exact: true })).toBeEnabled()
})

test('large JSON is stored and opens as JSON', async ({ page, context }) => {
  const items = Array.from({ length: 1500 }, (_, i) => ({ id: i, word: Math.random().toString(36).slice(2, 9) }))
  await page.goto('/#/json')
  await setJsonText(page, JSON.stringify({ title: 'Stored JSON', items }))
  await page.getByRole('button', { name: 'Seal link' }).click()
  const url = await page.getByTestId('share-url').inputValue()
  expect(url).toMatch(/#\/s\//)
  const reader = await context.newPage()
  await reader.goto(url)
  await expect(reader.locator('.json-reader').getByText('Stored JSON')).toBeVisible()
})
