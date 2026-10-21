import { expect, test, type Page } from '@playwright/test'
import { inlineHash, openShare } from './helpers.ts'

// The e2e build sends PostHog events to /ph on the preview server; these tests capture them.

type Captured = { body: string }

async function capture(page: Page): Promise<Captured[]> {
  // PostHog drops events from automated browsers (a production feature); look like a person.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false })
    Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined })
  })
  const requests: Captured[] = []
  await page.route('**/ph/**', async (route) => {
    requests.push({ body: route.request().postData() ?? '' })
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":1}' })
  })
  return requests
}

function decode(body: string): string {
  // Plain JSON, or form-encoded base64 depending on the transport.
  const data = new URLSearchParams(body).get('data')
  if (data) return Buffer.from(decodeURIComponent(data), 'base64').toString('utf8')
  return body
}

const secret = 'TOP SECRET MEETING NOTES 9f3a'

test('events are sent without URLs fragments or document text', async ({ page }) => {
  const requests = await capture(page)
  const hash = inlineHash(`# ${secret}`)
  await page.goto('/' + hash)
  await expect(page.getByRole('heading', { name: secret })).toBeVisible()
  await page.goto('/#/')
  await page.getByRole('textbox', { name: /Paste or type Markdown/ }).fill(`# ${secret}\n\n\`\`\`mermaid\ngraph TD; A-->B\n\`\`\``)
  await (await openShare(page)).getByRole('button', { name: 'Seal link' }).click()
  await expect(page.getByTestId('share-url')).toBeVisible()

  await expect.poll(() => requests.map((r) => decode(r.body)).join('\n'), { timeout: 15_000 }).toContain('link_created')
  const sent = requests.map((r) => decode(r.body)).join('\n')
  expect(sent).toContain('app_opened')
  // Pageviews feed PostHog's Web Analytics; one per route kind visited, URL cut down like every event.
  expect(sent).toContain('"event":"$pageview"')
  expect(sent).toMatch(/"\$pageview"[\s\S]*"route":"inline"|"route":"inline"[\s\S]*"\$pageview"/)
  expect(sent).toContain('"app":"sealdown"')
  expect(sent).toContain('"diagram_types":["graph"]')
  expect(sent).toContain('"$current_url":"http://localhost:4317/"')
  expect(sent).not.toContain('#/')
  expect(sent).not.toContain(hash.slice(4, 40))
  expect(sent).not.toContain(secret)
  expect(sent).not.toContain('$snapshot')
})

test('nothing is sent with Do Not Track', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'doNotTrack', { get: () => '1' }))
  const requests = await capture(page)
  await page.goto('/' + inlineHash('# Private'))
  await expect(page.getByRole('heading', { name: 'Private' })).toBeVisible()
  await page.waitForTimeout(3000)
  expect(requests).toHaveLength(0)
})

test('the document title is never sent, even when analytics loads after it is set', async ({ page }) => {
  const requests = await capture(page)
  const title = 'READER SECRET HEADING 7c1e'
  await page.goto('/' + inlineHash(`# ${title}\n\nbody`))
  await expect(page).toHaveTitle(new RegExp(title))
  await expect.poll(() => requests.map((r) => decode(r.body)).join('\n'), { timeout: 15_000 }).toContain('$pageview')
  const sent = requests.map((r) => decode(r.body)).join('\n')
  expect(sent).not.toContain(title)
  expect(sent).not.toContain('"title"')
})

type SentEvent = { event: string; properties: Record<string, unknown> }

function events(requests: Captured[]): SentEvent[] {
  return requests.flatMap((r) => {
    try {
      const parsed = JSON.parse(decode(r.body)) as SentEvent | SentEvent[] | { batch: SentEvent[] }
      const list = Array.isArray(parsed) ? parsed : 'batch' in parsed ? parsed.batch : [parsed]
      return list.filter((e) => e && typeof e.event === 'string' && e.properties)
    } catch {
      return []
    }
  })
}

const sentWith = (requests: Captured[], name: string, props: Record<string, unknown>) =>
  events(requests).some((e) => e.event === name && Object.entries(props).every(([k, v]) => e.properties[k] === v))

test('events on a document page carry its type', async ({ page }) => {
  const requests = await capture(page)
  await page.goto('/#/')
  await page.getByRole('tab', { name: 'Write' }).click()
  await page.getByLabel('Open .md').setInputFiles({ name: 'a.md', mimeType: 'text/markdown', buffer: Buffer.from('# A') })
  await page.getByRole('link', { name: 'JSON' }).click()
  await page.getByRole('tab', { name: 'Read' }).click()
  await page.getByLabel('Open .json').setInputFiles({ name: 'a.json', mimeType: 'application/json', buffer: Buffer.from(`{"s":"${secret}"}`) })
  await page.keyboard.press('ControlOrMeta+k')
  await page.keyboard.type('Download .json')
  await page.keyboard.press('Enter')
  await page.goto('/' + inlineHash('\u0001json\n{"r":1}'))
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: 'Download .json' }).click()

  await expect.poll(() => sentWith(requests, 'export', { format: 'json', doc_type: 'json', route: 'inline' }), { timeout: 15_000 }).toBe(true)
  expect(sentWith(requests, 'mode_changed', { mode: 'write', doc_type: 'markdown' })).toBe(true)
  expect(sentWith(requests, 'file_opened', { via: 'picker', doc_type: 'markdown' })).toBe(true)
  expect(sentWith(requests, 'mode_changed', { mode: 'read', doc_type: 'json' })).toBe(true)
  expect(sentWith(requests, 'file_opened', { via: 'picker', doc_type: 'json' })).toBe(true)
  expect(sentWith(requests, 'command_run', { command: 'export-json', doc_type: 'json', route: 'json-editor' })).toBe(true)
  expect(sentWith(requests, 'export', { format: 'json', doc_type: 'json', route: 'json-editor' })).toBe(true)
  expect(requests.map((r) => decode(r.body)).join('\n')).not.toContain(secret)
})
