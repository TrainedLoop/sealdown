import { expect, test, type Page } from '@playwright/test'
import { editorValue, openShare } from './helpers.ts'

// Runs against the local Supabase (scripts/e2e-stored.sh). Saves happen on their own after a pause.

const editor = (page: Page) => page.getByRole('textbox', { name: /Paste or type Markdown/ })
const secret = 'LIVE SECRET NOTES 7c1e'
const ARRIVES = { timeout: 12_000 }

async function share(page: Page, text: string): Promise<{ edit: string; read: string }> {
  await page.addInitScript(() => localStorage.setItem('sealdown.author', 'Ana'))
  await page.goto('/')
  await editor(page).fill(text)
  await (await openShare(page)).getByRole('button', { name: 'Share to edit' }).click()
  const result = {
    edit: await page.getByTestId('live-edit-url').inputValue(),
    read: await page.getByTestId('live-read-url').inputValue(),
  }
  await page.keyboard.press('Escape')
  return result
}

const failSave = (page: Page, code: string) =>
  page.route('**/rpc/save_state', (route) =>
    route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code, details: null, hint: null, message: 'x' }) }),
  )

test('a version over 1 MB is explained', async ({ page }) => {
  const { edit } = await share(page, 'small')
  await page.goto(edit)
  await failSave(page, '23514')
  await editor(page).fill('bigger')
  await expect(page.getByRole('alert')).toHaveText('This version is larger than 1 MB.', ARRIVES)
})

test('a full database keeps the draft', async ({ page }) => {
  const { edit } = await share(page, 'small')
  await page.goto(edit)
  await failSave(page, '53100')
  await editor(page).fill('kept')
  await expect(page.getByRole('alert')).toHaveText("Can't save right now. Your changes are kept in this browser.", ARRIVES)
})

test('a failed connection keeps the draft, even after a reload', async ({ page }) => {
  const { edit } = await share(page, 'small')
  await page.goto(edit)
  await page.route('**/rpc/save_state', (route) => route.abort())
  await editor(page).fill('kept offline')
  await expect(page.getByRole('alert')).toHaveText("Couldn't save. Your changes are kept in this browser.", ARRIVES)
  await page.unroute('**/rpc/save_state')
  await page.reload()
  await expect.poll(() => editorValue(page)).toBe('kept offline')
})

test('a removed document says so on both links', async ({ page }) => {
  const { edit, read } = await share(page, 'gone')
  for (const url of [edit, read]) {
    const fresh = await page.context().newPage()
    await fresh.route('**/rpc/get_state', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
    await fresh.goto(url)
    await expect(fresh.getByRole('alert')).toContainText('This document was removed.')
  }
})

test('analytics see live events but never the token or the text', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false })
    Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined })
    // Playwright can't intercept beacons; keep what they carry, decoded (data=<base64 JSON>).
    const beacons: string[] = []
    Object.assign(window, { beacons })
    const decode = (text: string) => {
      const encoded = decodeURIComponent(text.replace(/^data=/, ''))
      try {
        return new TextDecoder().decode(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)))
      } catch {
        return encoded
      }
    }
    navigator.sendBeacon = (_url, data) => {
      if (data instanceof Blob) void data.text().then((text) => beacons.push(decode(text)))
      else beacons.push(decode(String(data)))
      return true
    }
  })
  const bodies: string[] = []
  await page.route('**/ph/**', async (route) => {
    bodies.push(route.request().postData() ?? '')
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":1}' })
  })
  const { edit } = await share(page, `# ${secret}`)
  await page.goto(edit)
  await editor(page).fill(`# ${secret}\n\nmore`)
  await expect.poll(() => bodies.join('\n'), { timeout: 15_000 }).toMatch(/"event":"live_opened"[\s\S]*?"realtime":true/)
  await page.getByRole('region', { name: 'Live document' }).getByRole('button', { name: 'Versions' }).click()
  const panel = page.getByRole('dialog', { name: 'Versions' })
  await panel.getByRole('button', { name: 'Mark version' }).click()
  await panel.getByLabel('Version name').fill(secret)
  await panel.getByRole('button', { name: 'Save name' }).click()
  await expect.poll(() => bodies.join('\n'), { timeout: 15_000 }).toContain('"event":"version_named"')
  const beacons = () => page.evaluate(() => (window as unknown as { beacons: string[] }).beacons)
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')))
  await expect.poll(async () => (await beacons()).join('\n'), { timeout: 15_000 }).toMatch(/"event":"collab_peers"[\s\S]*?"max":0/)
  await page.waitForTimeout(3000)
  const sent = [...bodies, ...(await beacons())].join('\n')
  const token = edit.split('.').at(-1)!
  expect(sent).toContain('live_created')
  expect(sent).toMatch(/"event":"live_opened"[\s\S]*?"access":"edit"/)
  expect(sent).not.toContain(token)
  expect(sent).not.toContain(secret)
  expect(sent).not.toContain('Ana')
})

test('a version that is too large is not retried until the text changes', async ({ page }) => {
  const { edit } = await share(page, 'small')
  await page.goto(edit)
  let attempts = 0
  await page.route('**/rpc/save_state', (route) => {
    attempts++
    return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: '23514', details: null, hint: null, message: 'x' }) })
  })
  await editor(page).fill('bigger')
  await expect(page.getByRole('alert')).toBeVisible(ARRIVES)
  await page.waitForTimeout(6000)
  expect(attempts).toBe(1)
})

test('an edit link whose token stopped working turns read-only and stops saving', async ({ page }) => {
  const { edit } = await share(page, 'small')
  await page.goto(edit)
  let attempts = 0
  await page.route('**/rpc/save_state', (route) => {
    attempts++
    return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: '42501', details: null, hint: null, message: 'x' }) })
  })
  await editor(page).fill('mine')
  await expect(page.getByText("This edit link isn't valid anymore")).toBeVisible(ARRIVES)
  await page.waitForTimeout(5000)
  expect(attempts).toBe(1)
})
