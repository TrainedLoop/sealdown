# Sealdown Live Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Living Markdown/JSON documents with an edit link and a read link, versioned, merged three-way in the browser, encrypted end to end.

**Architecture:** Supabase stores whole encrypted snapshots per version (`live_docs`, `live_versions`) behind security-definer RPCs that check a hashed write token and an optimistic base version. The browser keeps a per-document local state (base + draft), merges with `node-diff3` (Markdown) or by JSON pointer (JSON), and reuses the existing editor and reader pages through small injection points.

**Tech Stack:** Postgres/pgTAP + dbmate, React 19, TypeScript, WebCrypto, node-diff3, Vitest, Playwright (local Supabase).

**Spec:** `docs/superpowers/specs/2026-10-21-sealdown-live-design.md`

## Global Constraints

- Server only ever sees ciphertext; the content key never leaves the fragment; the server stores `sha256(write token)` only.
- Links: read `#/l/<id>.<K>`, edit `#/w/<id>.<K>.<W>`; `id` base62 ×10, `K` 32 bytes, `W` 32 bytes, both base64url.
- Version content ≤ 1 MB (1048576 bytes); author card ≤ 1 KB (1024 bytes); keep the newest 50 versions.
- Sealdown budget 100 MB (104857600) over fixed + live content; database guard via `sealdown.max_database_bytes` (default 471859200), error `53100`.
- Error codes: wrong token `42501`, missing `P0002`, stale base `40001` (detail = latest version number).
- Polling every 30 s, only while `document.visibilityState === 'visible'`.
- Local keys: `sealdown.live.<id>` → `{ base, baseText, draft }`; `sealdown.author`.
- UI copy only in `src/i18n/locales` (en + pt); code and commits in English.
- Analytics: no content, names, links or keys.

## Review Focus

- Two tabs of the same browser on the same edit link share `sealdown.live.<id>`: saving in one must not silently drop the other's unsaved draft (Task 6: test "a second tab keeps its own unsaved text").
- A save racing a poll-triggered update (Update clicked while Save in flight) must not save twice or lose text (Task 6: Save and Update disabled while busy; test).
- A merge where both sides made the identical change is clean, not a conflict (Task 4 unit test).
- The edit token appears nowhere in analytics or the read link copied from the edit page (Task 8: analytics test with token string; Task 5 unit test on `readLinkOf`).
- Restoring a version while another person saved meanwhile goes through the normal stale/merge path (Task 7: restore uses `saveVersion` with the current base).

---

### Task 1: Database — live tables, RPCs, unified pruning

**Files:**
- Create: `db/migrations/20261021000000_live.sql`, `supabase/tests/live.test.sql`
- Modify: `supabase/tests/docs.test.sql` (migration list now has two versions; plan count)

**Interfaces:**
- Produces RPCs (all `security definer`, `search_path = ''`, `anon` execute): `create_live(content text, author text, write_hash text) → text`, `get_live(doc_id text) → table(version int, content text, author text, created_at timestamptz)`, `live_head(doc_id text) → int`, `get_live_version(doc_id text, version int) → table(content text, author text, created_at timestamptz)`, `list_versions(doc_id text) → table(version int, author text, size_bytes int, created_at timestamptz)`, `save_version(doc_id text, write_token text, base_version int, content text, author text) → int`. Base64 in/out single-line as `get_doc`. `write_hash` arrives as base64 of the 32-byte SHA-256; `write_token` as base64 of the raw 32 bytes.
- `prune_docs(cap_bytes bigint default 104857600) → int` counts deleted fixed docs + deleted live docs.

- [ ] **Step 1: Write `supabase/tests/live.test.sql` (pgTAP)** with, at least:
  - anon can create (id matches `^[A-Za-z0-9]{10}$`), `live_head` = 1, `get_live` returns version 1 content unchanged;
  - `save_version` with wrong token → `throws_ok(..., '42501')`; missing id → `'P0002'`; base 0 when head is 1 → `'40001'`;
  - right token + base 1 → returns 2; `list_versions` newest first with `size_bytes`;
  - 55 saves → `count(*) = 50` and oldest kept version = 6;
  - anon cannot `select` `live_docs`/`live_versions` (`42501`);
  - prune: one fixed doc (10 B, 3 days old) and one live doc with two 10 B versions (1 day old), `prune_docs(cap_bytes => 25)` deletes the fixed doc; with `cap_bytes => 15` deletes the live doc whole (no orphan versions);
  - inline prune: `set local sealdown.budget_bytes = '25'` then `save_version` on a live doc while an older fixed doc exists → fixed doc gone;
  - guard: `set local sealdown.max_database_bytes = '1'` → `create_live` and `save_version` throw `'53100'`.
- [ ] **Step 2:** `pnpm db:reset && pnpm db:test` → FAIL (functions missing).
- [ ] **Step 3:** Write the migration. Inline pruning calls `sealdown.prune_docs(coalesce(nullif(current_setting('sealdown.budget_bytes', true), '')::bigint, 104857600))` before inserting, only when total content exceeds the budget. Stale error: `raise exception 'stale' using errcode = '40001', detail = latest::text`. History cap: delete versions of the doc with `version <= new - 50`. Unified prune ranks rows `(kind, id, bytes, last_accessed_at)` from both tables (live bytes = sum of its versions) by `last_accessed_at desc, id` with a running sum. `down` restores the original `prune_docs` body. Update `docs.test.sql` to expect both migration versions.
- [ ] **Step 4:** `pnpm db:reset && pnpm db:test` → PASS (all files).
- [ ] **Step 5:** Commit `feat(db): live documents with versions and unified pruning`.

### Task 2: Live links and keys

**Files:**
- Create: `src/live/links.ts`; Modify: `src/share/crypto.ts`, `src/router/route.ts`
- Test: `tests/unit/live/links.test.ts`, `tests/unit/router/route.test.ts`, `tests/unit/share/crypto.test.ts`

**Interfaces:**
- `crypto.ts`: `newKey(): string` (base64url of 32 random bytes); `encryptWithKey(data: Uint8Array, key: string): Promise<Uint8Array>` (IV + ciphertext, decryptable by existing `decrypt`).
- Route kinds `{ kind: 'live-read'; id: string; key: string }`, `{ kind: 'live-edit'; id: string; key: string; token: string }` in `parseRoute`/`buildHash` (`ShareableRoute` includes them).
- `links.ts`: `newWriteToken(): string`; `writeHash(token: string): Promise<string>` (standard base64 of SHA-256 of the raw token bytes); `readLinkOf(route: live-edit): live-read route`.

- [ ] **Step 1: Tests:** parse `#/l/Ab3dE5gH9k.<43 chars>` and `#/w/Ab3dE5gH9k.<43>.<43>` (and trailing `.`); malformed: bad id, missing token part; round trip `buildHash`; `encryptWithKey` then `decrypt` round trip with the same key; `readLinkOf` drops the token; `writeHash` of 32 zero bytes equals the known SHA-256 base64 `Zmh6rfhivXdsj8GLjp+OIAiXFIVu4jOzkCpZHQ1fKSU=`.
- [ ] **Step 2:** `pnpm test tests/unit` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `pnpm test && pnpm typecheck` → PASS.
- [ ] **Step 5:** Commit `feat: live document links and keys`.

### Task 3: Live storage client

**Files:**
- Create: `src/storage/live.ts`; Test: `tests/unit/storage/live.test.ts`
- Modify: `src/storage/storage.ts` (export the `rpc` helper as `createRpc(config, fetchImpl)` so both clients share it; behaviour unchanged except error bodies are returned for PostgREST errors)

**Interfaces:**
- `type LiveErrorKind = 'forbidden' | 'missing' | 'stale' | 'full' | 'network' | 'too-large'`; `class LiveError extends Error { kind; latest?: number }`.
- `type LiveVersion = { version: number; content: Uint8Array; author: Uint8Array; createdAt: string }`; `type VersionInfo = { version: number; author: Uint8Array; sizeBytes: number; createdAt: string }`.
- `interface LiveStorage { create(content, author: Uint8Array, writeHash: string): Promise<string>; latest(id): Promise<LiveVersion>; head(id): Promise<number>; version(id, n): Promise<LiveVersion>; list(id): Promise<VersionInfo[]>; save(id, token: string, base: number, content, author: Uint8Array): Promise<number> }`; `defaultLiveStorage`; `liveAvailable(): boolean` (both env vars set).
- Mapping: PostgREST error `code` `42501`→forbidden, `P0002` or empty result→missing, `40001`→stale with `latest = Number(details)`, `53100`→full, `23514`→too-large, fetch failure/5xx→network.

- [ ] **Step 1: Tests** with a fake `fetch`: each RPC posts to `/rest/v1/rpc/<name>` with `content-profile: sealdown` and base64 bodies; each error code maps to its kind (`stale` carries `latest: 7` from `details: "7"`); `save` returns the new number.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** `pnpm test` → PASS (existing storage tests unchanged).
- [ ] **Step 5:** Commit `feat: live storage client`.

### Task 4: Three-way merge

**Files:**
- Create: `src/live/merge.ts`; Test: `tests/unit/live/merge.test.ts`; Add dependency `node-diff3`.

**Interfaces:**
- `type Conflict = { id: number; label: string; mine: string; theirs: string }` (label: line range for Markdown, JSON pointer for JSON).
- `type MergeResult = { text: string } | { conflicts: Conflict[]; resolve: (choices: Record<number, 'mine' | 'theirs' | 'both'>) => string }`.
- `mergeMarkdown(base: string, mine: string, theirs: string): MergeResult`; `mergeJson(base: string, mine: string, theirs: string): MergeResult` (output `JSON`-printed with 2 spaces via lossless-json; `both` behaves as `mine` for JSON).

- [ ] **Step 1: Tests:**
  - md: disjoint line edits → `{ text }` with both; same edit both sides → clean; overlapping different edits → one conflict, `resolve({0:'mine'})`, `'theirs'`, `'both'` (mine lines then theirs lines) give the expected texts; mine === base → theirs.
  - json: different keys changed → merged object; same key different values → conflict labelled `/a`, resolve picks; key added by one side, removed key by the other side untouched → both applied; arrays by index; big integers survive (`12345678901234567890`); invalid JSON on any side → single conflict labelled `document` whose mine/theirs are the whole texts.
- [ ] **Step 2:** FAIL. **Step 3:** implement (`node-diff3` `diff3Merge` for Markdown; recursive merge over lossless-parsed values for JSON). **Step 4:** PASS. **Step 5:** Commit `feat: three-way merge for Markdown and JSON`.

### Task 5: Live session (no UI)

**Files:**
- Create: `src/live/session.ts`, `src/live/localState.ts`, `src/live/author.ts`; Test: `tests/unit/live/session.test.ts`

**Interfaces:**
- `localState.ts`: `type LocalLive = { base: number; baseText: string; draft: string }`; `loadLocal(id): LocalLive | null`; `saveLocal(id, s: LocalLive): void`.
- `author.ts`: `loadAuthor(): string | null`; `saveAuthor(name: string)`; `encryptAuthor(name, key): Promise<Uint8Array>`; `decryptAuthor(bytes, key): Promise<string>` (`''` on failure).
- `session.ts`:
  - `createLiveDoc(doc: Doc, author: string, storage): Promise<{ edit: string; read: string }>` (full URLs with `baseUrl`).
  - `openLive(route, storage): Promise<{ doc: Doc; version: number; author: string; createdAt: string }>`.
  - `saveDraft(route: live-edit, local: LocalLive, docType, author, storage): Promise<SaveOutcome>` where `SaveOutcome = { kind: 'saved'; version: number; text: string } | { kind: 'conflicts'; latest: number; latestText: string; merge: MergeResult & { conflicts } }`. Flow: save on `local.base`; on `stale`, fetch latest, merge (`base=baseText, mine=draft, theirs=latest`); clean → save on latest (loop at most 3 times); conflicts → return them.
  - `saveResolved(route, latest: number, text, docType, author, storage): Promise<SaveOutcome>` (same flow with `base = latest`).
  - `updateFromLatest(route, local, docType, storage): Promise<{ local: LocalLive; conflicts?: MergeResult }>` (fetch latest, merge into draft; new base = latest).
  - `restoreVersion(route, n, local, docType, author, storage)`: saves version n's text via `saveDraft` with `draft = text of n`.

- [ ] **Step 1: Tests** with an in-memory `LiveStorage` fake implementing the token/base rules: create → open round trip (markdown and json, type survives); save on current base → version 2, local base advanced; two sessions: A saves, B (stale) with disjoint change → merged and saved as v3 with both changes; B overlapping → `conflicts`, then `saveResolved` → v3; author round trip; read route can't save (no token → type error at compile; runtime `forbidden` maps through).
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** Commit `feat: live document session`.

### Task 6: UI — Share to edit, edit page, read page

**Files:**
- Create: `src/ui/ShareLiveModal.tsx`, `src/ui/LiveBar.tsx`, `src/ui/LiveEditPage.tsx`, `src/ui/LiveReadPage.tsx`, `src/ui/NamePrompt.tsx`; e2e `tests/e2e/live.spec.ts`
- Modify: `src/App.tsx` (routes, page class, pageview names `live-edit`/`live-read`), `src/ui/EditorPage.tsx`, `src/ui/JsonEditorPage.tsx` (injection points), `src/ui/ReaderPage.tsx` (export `Document` with optional `banner`), `src/ui/JsonDocument.tsx` (optional `banner`), `playwright.config.ts` + `playwright.stored.config.ts` (`testMatch: ['stored.spec.ts', 'live*.spec.ts']`, main project ignores them), locales.

**Interfaces:**
- Editors gain an optional prop `live?: { draft: { load(): string; save(text: string): void }; actions: (getText: () => string) => ReactNode; editorKey: number }`. With `live`: drafts come from `live.draft`, the header actions slot renders `live.actions(getText)` instead of Seal controls, and `editorKey` remounts the editor when the session replaces the text. `getText` returns the freshest text (Markdown: latest ref; JSON: text pane `getText()`).
- Without `live`, editors render a **Share to edit** button (hidden when `!liveAvailable()`) that calls `createLiveDoc` and opens `ShareLiveModal({ edit, read, onClose })` (copy buttons with testids `live-edit-url` and `live-read-url`, QR for each, note copy).
- `LiveBar({ version, author, createdAt, newer?: number, newerAuthor?: string, onUpdate, children })` (on the edit page `children` holds Versions, Copy read link and Save version): "Live · v{{version}} · {{author}}, {{time}}" (relative time via `Intl.RelativeTimeFormat`), update notice button "{{author}} saved v{{n}} · Update".
- `LiveEditPage({ route, theme })`: loads via `openLive`; initialises `LocalLive` when absent or when its base is older and draft === baseText; polling `head` every 30 s when visible; **Save version** button + Ctrl/Cmd+S (`NamePrompt` first time); disables Save/Update while busy; on wrong token renders `LiveReadPage` with a notice.
- `LiveReadPage({ route, theme, notice? })`: `Document`/`JsonDocument` with `banner={<LiveBar …/>}`; polling; Update reloads.

- [ ] **Step 1: e2e (`tests/e2e/live.spec.ts`, local Supabase):** Share to edit from Markdown → modal shows both URLs; open edit URL in a new page → content + "v1"; type, Save version, name prompt "Ana" → bar "v2 · Ana"; open read URL → v2 content, no Save button; second page on edit URL saves → first page shows "Ana saved v3 · Update" within 35 s (use `page.clock` to fast-forward), Update shows the new text; JSON: Share to edit from `#/json`, edit link opens JSON editor; Ctrl/Cmd+S saves; a second tab keeps its own unsaved text (two pages, edit in A, save in B, A's draft still on screen after B's save).
- [ ] **Step 2:** `pnpm db:start` (if needed) then `pnpm test:e2e:stored` → FAIL.
- [ ] **Step 3:** Implement. Local state per tab: the second-tab case is handled by keeping the on-screen draft in memory and writing `sealdown.live.<id>` only from the tab that edits (last write wins for the stored draft; the on-screen text never changes under the user).
- [ ] **Step 4:** `pnpm test:e2e:stored`, `pnpm test:e2e`, `pnpm test` → PASS.
- [ ] **Step 5:** Commit `feat: share to edit, live edit and read pages`.

### Task 7: Conflict dialog and versions panel

**Files:**
- Create: `src/ui/ConflictDialog.tsx`, `src/ui/VersionsPanel.tsx`, `src/ui/lineDiff.ts`; Test: `tests/unit/ui/lineDiff.test.ts`, e2e `tests/e2e/live-history.spec.ts`
- Modify: `src/ui/LiveEditPage.tsx`, `src/ui/LiveReadPage.tsx`, locales

**Interfaces:**
- `ConflictDialog({ conflicts: Conflict[]; docType; onResolve(choices): void; onCancel(): void })`: aria-modal dialog with focus trap (`useFocusTrap`, layout effect autofocus); per conflict a radio group Mine / Theirs / Both (Both only for Markdown).
- `lineDiff(a: string, b: string): { kind: 'same' | 'added' | 'removed'; text: string }[]` (via `node-diff3` `diffComm` or LCS).
- `VersionsPanel({ route, docType, current: number, canRestore: boolean, onRestore(n): void, onClose })`: list (number, author, relative time); selecting shows content and `lineDiff` against current.

- [ ] **Step 1:** unit tests for `lineDiff` (insert, delete, change); e2e: two pages edit the same line → second save opens the conflict dialog listing one conflict; choosing Theirs and Save → saved version has their line; Cancel keeps the draft unsaved; versions panel lists v1..v3 with authors; opening v1 shows its diff; Restore (edit link) creates v4 with v1's text; read link has no Restore.
- [ ] **Step 2–4:** FAIL → implement → PASS (`pnpm test`, `pnpm test:e2e:stored`).
- [ ] **Step 5:** Commit `feat: conflict resolution and version history`.

### Task 8: Errors, analytics, docs, release

**Files:**
- Modify: `src/ui/LiveEditPage.tsx`, `src/ui/LiveReadPage.tsx`, `src/analytics.ts` (event names), `README.md`, locales; e2e additions in `tests/e2e/live.spec.ts` and `tests/e2e/analytics.spec.ts`

**Interfaces:**
- Events: `live_created`, `live_opened` (`access`), `version_saved` (`merged`, `conflicts`), `conflict_resolved`, `version_restored`, `versions_viewed`.

- [ ] **Step 1: Tests:** version over 1 MB → "This version is larger than 1 MB."; database guard (`full`) → "Can't save right now."; pruned document → both links show "This document was removed."; network failure on save (route `**/rpc/save_version` aborted) → "Couldn't save. Your changes are kept in this browser." and the draft survives a reload; analytics test opens an edit link and asserts the token string and document text never appear in sent events while `live_opened` with `access: 'edit'` does.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** README (features, links table rows for `#/l` and `#/w`, metrics table), then every suite: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm test:e2e:stored && pnpm test:visual && pnpm db:test`.
- [ ] **Step 6:** Final whole-branch review; fix Critical/Important.
- [ ] **Step 7:** Apply the migration in production (`pnpm db:migrate`), merge to `main`, push, confirm deploy.
