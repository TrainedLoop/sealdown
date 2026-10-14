import { expect, test, type Page } from '@playwright/test'
import { editorValue } from './helpers.ts'

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

test('insert diagram adds the example at the cursor', async ({ page }) => {
  await page.goto('/')
  await editor(page).fill('# Notes\n')
  await page.getByRole('combobox', { name: 'Insert diagram' }).selectOption({ label: 'flowchart' })
  await expect.poll(() => editorValue(page)).toContain('```mermaid\nflowchart LR')
  await expect(page.getByRole('combobox', { name: 'Insert diagram' })).toHaveValue('')
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
