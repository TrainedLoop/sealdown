import { expect, test, type Page } from '@playwright/test'
import { inlineHash } from './helpers.ts'

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
  await page.getByRole('button', { name: 'Generate link' }).click()
  await expect(page.getByTestId('share-url')).toBeVisible()

  await expect.poll(() => requests.map((r) => decode(r.body)).join('\n'), { timeout: 15_000 }).toContain('link_created')
  const sent = requests.map((r) => decode(r.body)).join('\n')
  expect(sent).toContain('app_opened')
  // Pageviews feed PostHog's Web Analytics; one per route kind visited, URL cut down like every event.
  expect(sent).toContain('"event":"$pageview"')
  expect(sent).toMatch(/"\$pageview"[\s\S]*"route":"inline"|"route":"inline"[\s\S]*"\$pageview"/)
  expect(sent).toContain('"app":"rendermd"')
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
