# Sealdown JSON mode — Design

- **Date:** 2026-10-19
- **Status:** approved in chat
- **Builds on:** `2026-10-15-sealdown-design.md`

## 1. Goal

Seal JSON documents the way Sealdown seals Markdown. The editor follows jsoneditoronline.org:
text with validation on the left, a synchronized tree on the right. The encryption, link formats,
database, passwords, seal dialog, QR code and analytics are reused unchanged.

## 2. Decisions

| Topic | Decision |
|---|---|
| Library | `vanilla-jsoneditor` (ISC). It provides text, tree and table modes, validation, repair, sort, transform and queries. Loaded lazily, only on JSON pages. |
| Document type | Stored **inside** the sealed content: JSON documents start with the marker `\u0001json\n` before compression. Markdown is unmarked, so existing and new Markdown links are byte-for-byte what they are today. |
| Navigation | A **Markdown \| JSON** switch beside the wordmark. Markdown at `#/`, JSON at `#/json`. |
| Drafts | One draft per type: `sealdown.draft` (unchanged) and `sealdown.draft.json`. |
| Invalid JSON | Can be sealed. The reader shows it in text mode with the error marked. |

## 3. Content type marker

- `src/share/docType.ts` exports `type DocType = 'markdown' | 'json'`, `encodeDoc({type, text})` and `decodeDoc(text)`.
- `encodeDoc` prefixes `\u0001json\n` for JSON and returns Markdown as is. `decodeDoc` strips the marker when present and otherwise returns `{type: 'markdown', text}`.
- `createLink` and `openRoute`/`openProtected` keep working on strings; callers encode before sealing and decode after opening. The marker is encrypted with the text, so a link never reveals its type.
- U+0001 never starts a real Markdown document, so legacy links decode as Markdown.

## 4. Routing

- `parseRoute('#/json')` (and `#/json/`) returns `{kind: 'json-editor'}`; `buildHash` maps it back.
- `App` renders `JsonEditorPage` for it. Readable routes are unchanged: `ReaderPage` decodes the type and shows the Markdown document or the JSON viewer.
- Pageview route name: `json-editor`.

## 5. Header switch

- A segmented control with two links, "Markdown" (`#/`) and "JSON" (`#/json`), right after the wordmark; the active one is marked with `aria-current="page"`. On reader pages neither is active.
- The wordmark keeps linking to `#/`.
- On phones the switch stays in the first header row; the labels shorten to "MD" and "JSON" below 480px.
- The **Aa** menu is hidden on JSON pages (editor and reader): it styles Markdown only.

## 6. JSON editor (`#/json`)

- **Layout:** two panes. Left: the library in `text` mode (validation, error markers, format, compact, sort, repair, transform). Right: the library in `tree` mode (tree and table via its own menu). Below 900px the panes become tabs **Text | Tree** in the header's center slot.
- **Sync:** every change on one side updates the other from the text. When the text does not parse, the tree shows the library's parse-error state (with its repair button).
- **Draft:** saved 500 ms after the last change, flushed on leaving, like Markdown.
- **Header actions:** Open (`.json`, also by drop on the panes), Export (`.json`), password field and **Seal link**, the same controls as Markdown.
- **Sealing:** same `createLink`, with `encodeDoc({type: 'json', text})`. The seal dialog is reused unchanged.
- **Empty draft:** starts with `{}` the first time, so the tree has something to show.
- **No** formatting toolbar, diagram picker, modes, status bar or Aa.
- **Palette:** Seal link, Open, Export .json, Switch to Markdown.

## 7. JSON reader

- Same loading, unseal card, errors and "Unsealed only in this browser" badge as Markdown.
- The body is the library, read-only, in **tree** mode (text when the JSON is invalid), with its mode menu for text and table. Full width, on the dark canvas, no paper sheet.
- **Header actions:** Export `.json` and **Edit a copy**: confirm before replacing a different, non-empty JSON draft, then save it and go to `#/json`.
- No Present, PDF or TOC. The page title is "JSON".
- **Palette:** Edit a copy, Export .json.

## 8. Look

- The library is themed through its `--jse-*` variables, mapped to the Vault tokens in both themes (backgrounds, panels, borders, text, mint accent for the theme color and selection, key/value colors from the existing syntax palette). Fonts: Plex Mono for content, Plex Sans for menus.

## 9. Analytics

- `link_created` and `link_opened` gain `doc_type` (`markdown` or `json`). For JSON, `diagram_count`/`diagram_types` are omitted.
- `export` gains `format: 'json'`; `file_opened` is shared.
- Pageview route `json-editor`. Never the content, keys or paths.

## 10. Testing

- Unit: `encodeDoc`/`decodeDoc` round trip and legacy text; `parseRoute('#/json')`; analytics allowlist accepts `doc_type`.
- E2E: switch navigation; drafts kept per type; text edit updates the tree and tree edit updates the text; invalid JSON shows an error; seal → open round trip for JSON (inline, password and stored); a Markdown link still opens as Markdown; Edit a copy goes to `#/json` with the content; Export `.json`; Open a `.json` file; Aa hidden on JSON pages; phone layout tabs.
- Visual baselines are unaffected (diagram screenshots only).

## 11. Delivery

Branch `feat/json`, tested batches, merged to `main` when every suite is green.
