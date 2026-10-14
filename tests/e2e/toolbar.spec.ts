import { expect, test, type Page } from '@playwright/test'
import { editorValue } from './helpers.ts'

const editor = (page: Page) => page.getByRole('textbox', { name: /Paste or type Markdown/ })
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Formatting' })

test('bold wraps the selected word', async ({ page }) => {
  await page.goto('/')
  await editor(page).fill('make this strong')
  await editor(page).press('End')
  for (let i = 0; i < 6; i++) await editor(page).press('Shift+ArrowLeft')
  await toolbar(page).getByRole('button', { name: 'Bold' }).click()
  await expect.poll(() => editorValue(page)).toBe('make this **strong**')
})

test('Ctrl+B and Ctrl+I work in the editor', async ({ page }) => {
  await page.goto('/')
  await editor(page).fill('')
  await editor(page).press('ControlOrMeta+b')
  await expect.poll(() => editorValue(page)).toBe('**bold**')
  await editor(page).press('End')
  await editor(page).press('ControlOrMeta+i')
  await expect.poll(() => editorValue(page)).toBe('**bold***italic*')
})

test('heading, list and table buttons', async ({ page }) => {
  await page.goto('/')
  await editor(page).fill('Title')
  await toolbar(page).getByRole('button', { name: 'Heading 2' }).click()
  await expect.poll(() => editorValue(page)).toBe('## Title')
  await toolbar(page).getByRole('button', { name: 'Heading 2' }).click()
  await expect.poll(() => editorValue(page)).toBe('Title')
  await toolbar(page).getByRole('button', { name: 'Task list' }).click()
  await expect.poll(() => editorValue(page)).toBe('- [ ] Title')
  await editor(page).press('ControlOrMeta+End')
  await toolbar(page).getByRole('button', { name: 'Table' }).click()
  await expect.poll(() => editorValue(page)).toContain('| Column | Column |')
})

test('every formatting button has a name', async ({ page }) => {
  await page.goto('/')
  const names = await toolbar(page).getByRole('button').evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label') ?? b.textContent))
  expect(names).toEqual([
    'Heading 1', 'Heading 2', 'Heading 3', 'Bold', 'Italic', 'Strikethrough', 'Inline code', 'Link', 'Image',
    'Bulleted list', 'Numbered list', 'Task list', 'Quote', 'Code block', 'Table', 'Math', 'Divider', 'Insert diagram',
  ])
})

test('the toolbar is hidden in read mode', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await page.getByRole('tab', { name: 'Read' }).click()
  await expect(toolbar(page)).toHaveCount(0)
})
