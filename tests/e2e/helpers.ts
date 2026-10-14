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
