import { expect, test, type Page } from '@playwright/test'
import { editorValue, withTheme } from './helpers.ts'

const editor = (page: Page) => page.getByRole('textbox', { name: /Paste or type Markdown/ })

async function drop(page: Page, name: string, type: string, content: string) {
  await page.evaluate(
    ([name, type, content]) => {
      const transfer = new DataTransfer()
      transfer.items.add(new File([content], name, { type }))
      const target = document.querySelector('.code-editor')!
      for (const kind of ['dragenter', 'dragover', 'drop']) {
        target.dispatchEvent(new DragEvent(kind, { dataTransfer: transfer, bubbles: true, cancelable: true }))
      }
    },
    [name, type, content],
  )
}

test('the diagram picker lists every example with a thumbnail', async ({ page }) => {
  await withTheme(page, 'light')
  await page.goto('/')
  await editor(page).fill('# Notes\n')
  await page.getByRole('button', { name: 'Insert diagram' }).click()
  const search = page.getByRole('combobox', { name: 'Search diagrams' })
  await expect(search).toBeFocused()
  const options = page.getByRole('option')
  await expect(options).toHaveCount(33)
  await expect(options.first().locator('img')).toHaveAttribute('src', /diagram-thumbs\/flowchart-light\.png$/)
  expect(await options.first().locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
})

test('typing filters the picker and Enter inserts the example', async ({ page }) => {
  await page.goto('/')
  await editor(page).fill('# Notes\n')
  await page.getByRole('button', { name: 'Insert diagram' }).click()
  await page.getByRole('combobox', { name: 'Search diagrams' }).fill('seq')
  await expect(page.getByRole('option')).toHaveCount(1)
  await expect(page.getByRole('option')).toContainText('sequence')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect.poll(() => editorValue(page)).toContain('```mermaid\nsequenceDiagram')
  await expect(page.getByRole('listbox')).toHaveCount(0)
})

test('clicking an example inserts it; Escape closes the picker', async ({ page }) => {
  await page.goto('/')
  await editor(page).fill('# Notes\n')
  await page.getByRole('button', { name: 'Insert diagram' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await page.getByRole('button', { name: 'Insert diagram' }).click()
  await page.getByRole('option', { name: 'pie' }).click()
  await expect.poll(() => editorValue(page)).toContain('```mermaid\npie')
})

test('the picker uses dark thumbnails in the dark theme', async ({ page }) => {
  await withTheme(page, 'dark')
  await page.goto('/')
  await page.getByRole('button', { name: 'Insert diagram' }).click()
  await expect(page.getByRole('option').first().locator('img')).toHaveAttribute('src', /-dark\.png$/)
})

test('the insert button stays visible while scrolling a long document', async ({ page }) => {
  await page.goto('/')
  await editor(page).fill(Array.from({ length: 300 }, (_, i) => `Line ${i}`).join('\n'))
  await page.locator('.cm-scroller').evaluate((el) => el.scrollTo(0, el.scrollHeight))
  await expect(page.getByRole('button', { name: 'Insert diagram' })).toBeInViewport()
})

test('open .md loads the file', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Open .md').setInputFiles({ name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('# From file ✓') })
  await expect.poll(() => editorValue(page)).toBe('# From file ✓')
})

test('dropping a markdown file loads it', async ({ page }) => {
  await page.goto('/')
  await expect(editor(page)).toBeVisible()
  await drop(page, 'dropped.md', '', '# Dropped')
  await expect.poll(() => editorValue(page)).toBe('# Dropped')
})

test('replacing existing text asks first', async ({ page }) => {
  await page.goto('/')
  await editor(page).fill('my work')
  page.once('dialog', (dialog) => dialog.dismiss())
  await drop(page, 'other.md', 'text/markdown', '# Other')
  await page.waitForTimeout(300)
  expect(await editorValue(page)).toBe('my work')
})

test('non-text files are refused', async ({ page }) => {
  await page.goto('/')
  await editor(page).fill('keep me')
  await drop(page, 'photo.png', 'image/png', 'PNG')
  await expect(page.getByRole('alert')).toContainText("isn't a Markdown or text file")
  expect(await editorValue(page)).toBe('keep me')
})

test('files over 5 MB are refused', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Open .md').setInputFiles({ name: 'huge.md', mimeType: 'text/markdown', buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 'a') })
  await expect(page.getByRole('alert')).toContainText('larger than 5 MB')
})

test('binary files without a type are refused', async ({ page }) => {
  await page.goto('/')
  await editor(page).fill('keep me')
  await drop(page, 'data.bin', '', 'PK\u0003\u0004\u0000\u0001binary')
  await expect(page.getByRole('alert')).toContainText("isn't a Markdown or text file")
  expect(await editorValue(page)).toBe('keep me')
})
