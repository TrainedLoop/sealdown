# Sealdown JSON Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seal JSON documents with a jsoneditoronline-style editor (text left, tree right) and a read-only JSON reader, reusing Sealdown's links, encryption and storage.

**Architecture:** A type marker (`\u0001json\n`) is prepended to JSON text before `createLink` and stripped after opening, so link formats and storage don't change. A new `#/json` route renders `JsonEditorPage`; `ReaderPage` branches on the decoded type. `vanilla-jsoneditor` is wrapped in one lazy React component and themed with `--jse-*` variables.

**Tech Stack:** React 19, TypeScript, vanilla-jsoneditor 3.13.0, Vitest, Playwright (Docker).

**Spec:** `docs/superpowers/specs/2026-10-19-sealdown-json-design.md`

## Global Constraints

- Code, comments, commits in English; UI copy only in `src/i18n/locales` (en + pt).
- Markdown links must stay byte-for-byte unchanged (no marker for Markdown).
- Analytics never carry content, titles, URLs or keys; JSON adds only `doc_type` and `format: 'json'`.
- `vanilla-jsoneditor` loads only on JSON pages (dynamic import).
- Drafts: `sealdown.draft` (Markdown, unchanged) and `sealdown.draft.json`.
- Test ports, Docker Playwright scripts and existing suites stay as they are.

## Review Focus

- A Markdown document that happens to start with `\u0001` but not the full marker → stays Markdown (unit test in Task 1).
- Very large JSON (close to 1 MB) → editor stays usable; the library switches to its large-document handling (no test; manual check in Task 5).
- Typing invalid JSON then sealing → the link opens in text mode with the error, not a blank tree (e2e in Task 4).
- Switching Markdown ↔ JSON mid-edit → both drafts survive (e2e in Task 3).
- Edit a copy of a JSON link while a different Markdown draft exists → no confirm, Markdown draft untouched (e2e in Task 4).

---

### Task 1: Document type marker, route and analytics

**Files:**
- Create: `src/share/docType.ts`
- Modify: `src/router/route.ts`, `src/App.tsx` (routeName only)
- Test: `tests/unit/share/docType.test.ts`, `tests/unit/router/route.test.ts`

**Interfaces:**
- Produces: `type DocType = 'markdown' | 'json'`; `type Doc = { type: DocType; text: string }`; `encodeDoc(doc: Doc): string`; `decodeDoc(text: string): Doc`; `JSON_MARKER = '\u0001json\n'`.
- Produces: Route kind `{ kind: 'json-editor' }`, included in `ShareableRoute`; `buildHash({kind:'json-editor'}) === '#/json'`.

- [ ] **Step 1: Write failing tests**
  - `encodeDoc({type:'markdown', text:'# a'}) === '# a'`; `encodeDoc({type:'json', text:'{}'}) === '\u0001json\n{}'`.
  - `decodeDoc('\u0001json\n{"a":1}')` → `{type:'json', text:'{"a":1}'}`; `decodeDoc('# a')` → markdown; `decodeDoc('\u0001jsonx')` → markdown, text unchanged; `decodeDoc('')` → markdown.
  - `parseRoute('#/json')`, `'#/json/'`, `'#/json.'` (trailing junk) → `{kind:'json-editor'}`; `parseRoute('#/jsonx')` → `unknown-format`; `buildHash({kind:'json-editor'})` → `'#/json'`.
- [ ] **Step 2:** `pnpm test tests/unit/share/docType.test.ts tests/unit/router` → FAIL.
- [ ] **Step 3:** Implement `docType.ts`; in `parseRoute`, after junk stripping, `path === '/json' || path === '/json/'` → json-editor. `routeName` in App returns `'json-editor'` naturally (kind name).
- [ ] **Step 4:** `pnpm test && pnpm typecheck` → PASS.
- [ ] **Step 5:** Commit `feat: JSON document type marker and #/json route`.

### Task 2: JsonEditor wrapper and Vault theme

**Files:**
- Create: `src/json/JsonEditor.tsx` (default export, lazy-loaded), `src/json/json.css`
- Test: covered by Task 3/4 e2e (the library needs a real browser).

**Interfaces:**
- Produces: `type JsonEditorProps = { text: string; mode: 'text' | 'tree'; readOnly?: boolean; label: string; onChange?: (text: string) => void }`; default export `JsonEditor(props)`. Imported via `lazy(() => import('../json/JsonEditor.tsx'))`.

- [ ] **Step 1:** Implement: `createJSONEditor({ target, props: { content: {text}, mode, readOnly, ariaLabel: label, askToFormat: false, onChange } })` in a mount effect, `destroy()` on unmount. On `text` prop changes, call `editor.update({text})` only when it differs from `editor.get()` as text (`toTextContent`), so its own echo never resets cursor. `onChange` reports `toTextContent(content).text`. `readOnly` via `updateProps`. Container class `json-editor` with `jse-theme-sealdown`.
- [ ] **Step 2:** `json.css`: `.jse-theme-sealdown` maps `--jse-theme-color` → `var(--accent)`, `--jse-theme-color-highlight`, `--jse-background-color`, `--jse-text-color`, `--jse-panel-*`, `--jse-main-border`, `--jse-menu-color` (text on accent), `--jse-modal-*`, `--jse-context-menu-*`, `--jse-key-color`, `--jse-value-color-*`, `--jse-selection-background-color`, `--jse-font-family` (Plex Sans), `--jse-font-family-mono` (Plex Mono) to existing Vault tokens in `styles.css`; the variables resolve per theme because the tokens do. Set `--jse-theme: dark` only under `[data-theme=dark]`.
- [ ] **Step 3:** `pnpm typecheck && pnpm lint` → clean.
- [ ] **Step 4:** Commit `feat: themed vanilla-jsoneditor wrapper`.

### Task 3: JSON editor page and header switch

**Files:**
- Create: `src/ui/JsonEditorPage.tsx`, `src/ui/SealControls.tsx` (password + Seal button + modal, extracted from EditorPage), `src/ui/jsonDraft.ts`, `src/ui/DocSwitch.tsx`
- Modify: `src/App.tsx`, `src/ui/Header.tsx`, `src/ui/EditorPage.tsx`, `src/styles.css`, `src/i18n/locales/*`, `src/analytics.ts` (no new events)
- Test: `tests/e2e/json-editor.spec.ts`

**Interfaces:**
- Consumes: `encodeDoc`, Route `json-editor`, `JsonEditor`.
- Produces: `loadJsonDraft(): string` (returns `'{}'` when none saved), `saveJsonDraft(text: string): void` (key `sealdown.draft.json`).
- Produces: `useSealLink(text: string, docType: DocType)` hook → `{ password, setPassword, busy, generate, shared, closeSeal, sealButton }` holding today's `generate` logic (tracks `link_created` with `doc_type`; diagram props only for markdown); `SealControls` renders password input + button in the actions slot and the `SealModal`. EditorPage switches to it with no visible change.
- Produces: `DocSwitch` — `<nav aria-label={t('docSwitch.label')}>` with links `#/` "Markdown" and `#/json` "JSON", `aria-current="page"` on the active route; rendered by Header after the wordmark; Header gets `route: Route` prop.

- [ ] **Step 1: Write failing e2e** (`tests/e2e/json-editor.spec.ts`):
  - `switch navigates`: on `#/`, click link "JSON" → URL ends `#/json`, `aria-current` on JSON; click "Markdown" → back.
  - `text edit updates tree`: on `#/json`, replace the left text with `{"name":"Ada","tags":[1,2]}` → right pane shows `name` key and `"Ada"`.
  - `tree edit updates text`: edit value `Ada` → `Grace` in tree (double click value, type, Enter) → left text contains `Grace`.
  - `invalid JSON shows error`: type `{"a":` → left pane shows the library's parse error, right shows its parse-error message.
  - `drafts per type`: type `# md` in Markdown, switch to JSON, type `{"j":1}`, reload `#/` → editor shows `# md`; go `#/json` → contains `"j"`.
  - `open .json file`: set input file `data.json` with `{"x":1}` → text shows it.
  - `export json`: Export → `.json` → download named `document.json` with the text.
  - `Aa hidden`: on `#/json` the typeset button is not visible.
  - `phone tabs`: viewport 390×800 → tabs Text/Tree; Tree tab shows tree, Text tab shows text.
- [ ] **Step 2:** `pnpm test:e2e tests/e2e/json-editor.spec.ts` → FAIL.
- [ ] **Step 3:** Implement. Layout `.json-page` grid two columns (≥900px), tabs below (reuse `.tabs` markup in the center slot). Drop handling wraps panes like `.editor-drop`. Open accepts `.json,application/json,text/plain`, same size/binary checks as Markdown (extract `readTextFile(file): Promise<string | FileProblem>` from EditorPage into `src/ui/readTextFile.ts` and use it in both). Palette group `json-editor`: seal, open, export-json. Header palette gains `switch-json`/`switch-markdown`. CSS hides `.typeset-menu` under `#root:has(.json-page, .json-reader)`. `docTitle`: JSON pages publish title `null`. Locale keys: `docSwitch.label/markdown/json/markdownShort`, `json.text`, `json.tree`, `json.label`, `export.json`, `json.openFile`, `palette.switchJson`, `palette.switchMarkdown`.
- [ ] **Step 4:** `pnpm test:e2e` (whole suite) and `pnpm test` → PASS.
- [ ] **Step 5:** Commit `feat: JSON editor with synchronized text and tree`.

### Task 4: JSON reader and sealing round trips

**Files:**
- Create: `src/ui/JsonDocument.tsx`
- Modify: `src/ui/ReaderPage.tsx`, `src/ui/JsonEditorPage.tsx` (seal with `encodeDoc`), `src/ui/EditorPage.tsx` (Markdown keeps raw text), `tests/e2e/helpers.ts`
- Test: `tests/e2e/json-reader.spec.ts`, `tests/e2e/stored.spec.ts` (add a JSON case)

**Interfaces:**
- Consumes: `decodeDoc`, `JsonEditor`, `loadJsonDraft`/`saveJsonDraft`.
- Produces: `ReaderPage` state `ready` holds `Doc`; `link_opened` tracks `doc_type`.
- Produces: helper `jsonInlineHash(json: string): string` = `inlineHash('\u0001json\n' + json)`.

- [ ] **Step 1: Write failing e2e:**
  - `seal and open JSON`: on `#/json` type `{"k":"v"}`, Seal → open `share-url` → tree shows `k`/`"v"`, badge "Unsealed only in this browser", no Present button.
  - `password JSON`: seal with password `pw` → unseal card → Unseal with `pw` → tree.
  - `invalid JSON link`: open `jsonInlineHash('{"a":')` → reader in text mode showing the error.
  - `markdown link still markdown`: `inlineHash('# Title')` → heading rendered.
  - `edit a copy`: open JSON link, Edit a copy → `#/json`, text equals the document; Markdown draft `# keep` set beforehand is still `# keep` on `#/`; with a different JSON draft present a confirm appears.
  - `export from reader`: Export `.json` downloads the text.
  - stored: a JSON larger than 4096 encoded chars seals to `#/s/` and opens as JSON.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `JsonDocument({ text, sealed })`: header actions Export menu (`.json`) + Edit a copy; body `.json-reader` with the badge and `JsonEditor` read-only, mode `tree` if `JSON.parse` succeeds else `text`. Palette group `reader`: edit-copy, export-json. ReaderPage decodes with `decodeDoc` after `openRoute`/`openProtected` and renders `Document` or `JsonDocument`.
- [ ] **Step 4:** `pnpm test:e2e`, `pnpm test:e2e:stored`, `pnpm test` → PASS.
- [ ] **Step 5:** Commit `feat: JSON reader and sealed JSON links`.

### Task 5: Docs, review and release

**Files:** `README.md` (features: JSON mode; links section: type marker; metrics table: `doc_type`, `format: json`, route `json-editor`).

- [ ] **Step 1:** Update README; `pnpm build` and check the JSON chunk is separate from the main bundle (`dist/assets`).
- [ ] **Step 2:** Manual check: paste a ~800 KB JSON, editor responsive; seal produces `#/s/`.
- [ ] **Step 3:** Run every suite: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm test:e2e:stored && pnpm test:visual && pnpm db:test`.
- [ ] **Step 4:** Whole-branch review by a fresh reviewer; fix findings.
- [ ] **Step 5:** Merge to `main`, push, watch CI and deploy.
