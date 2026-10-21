import { deflateRawSync } from 'node:zlib'
import type { Page } from '@playwright/test'

/** Builds the `#/v/…` hash for a document, the same way the app encodes inline links. */
export function inlineHash(text: string): string {
  return '#/v/' + deflateRawSync(Buffer.from(text, 'utf8')).toString('base64url')
}

/** The editor's text. CodeMirror renders one .cm-line per line (fine for the small documents tests read). */
export async function editorValue(page: Page): Promise<string> {
  return (await page.locator('.cm-content .cm-line').allTextContents()).join('\n')
}

/** Starts the page with a saved theme (the app is dark by default, whatever the system says). */
export async function withTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.addInitScript((t) => localStorage.setItem('sealdown.theme', t), theme)
}

/** Replaces the text in the JSON editor's text pane (the library's CodeMirror). */
export async function setJsonText(page: Page, text: string): Promise<void> {
  const content = page.locator('.json-text .cm-content')
  await content.click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText(text)
}

/** The JSON editor's text pane, line by line. */
export async function jsonText(page: Page): Promise<string> {
  return (await page.locator('.json-text .cm-content .cm-line').allTextContents()).join('\n')
}

/** A legacy `#/v/…` hash for a JSON document (type marker included). */
export function jsonInlineHash(json: string): string {
  return inlineHash('\u0001json\n' + json)
}

/** Opens the editor's Share menu (if closed) and returns its panel. */
export async function openShare(page: Page) {
  const panel = page.getByRole('dialog', { name: 'Share' })
  if (!(await panel.isVisible())) await page.getByRole('button', { name: 'Share', exact: true }).click()
  return panel
}
