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
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /sealdown-logo\/sealdown-icon-color\.svg$/)
})

test('preview image and favicon are served', async ({ request }) => {
  const og = await request.get('/og.png')
  expect(og.status()).toBe(200)
  expect(og.headers()['content-type']).toBe('image/png')
  for (const name of ['icon-color', 'icon-white', 'logo-color', 'logo-white']) {
    const icon = await request.get(`/sealdown-logo/sealdown-${name}.svg`)
    expect(icon.status()).toBe(200)
  }
})

for (const theme of ['dark', 'light'] as const) {
  test(`the header shows the ${theme === 'dark' ? 'white' : 'colour'} mark in the ${theme} theme`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('sealdown.theme', t), theme)
    await page.goto('/')
    const shown = page.locator('.brand .seal-mark img:visible')
    await expect(shown).toHaveCount(1)
    await expect(shown).toHaveAttribute('src', theme === 'dark' ? /icon-white\.svg$/ : /icon-color\.svg$/)
    expect(await shown.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
  })
}
