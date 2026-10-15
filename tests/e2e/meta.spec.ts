import { expect, test } from '@playwright/test'

test('link preview tags for chat apps', async ({ page }) => {
  await page.goto('/')
  const meta = (selector: string) => page.locator(selector).getAttribute('content')
  expect(await meta('meta[property="og:title"]')).toBe('sealdown')
  expect(await meta('meta[property="og:description"]')).toMatch(/Markdown/)
  expect(await meta('meta[property="og:type"]')).toBe('website')
  expect(await meta('meta[property="og:image"]')).toBe('https://trainedloop.github.io/sealdown/og.png')
  expect(await meta('meta[name="twitter:card"]')).toBe('summary_large_image')
  expect(await meta('meta[name="description"]')).toMatch(/Markdown/)
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /favicon\.svg$/)
})

test('preview image and favicon are served', async ({ request }) => {
  const og = await request.get('/og.png')
  expect(og.status()).toBe(200)
  expect(og.headers()['content-type']).toBe('image/png')
  const icon = await request.get('/favicon.svg')
  expect(icon.status()).toBe(200)
})
