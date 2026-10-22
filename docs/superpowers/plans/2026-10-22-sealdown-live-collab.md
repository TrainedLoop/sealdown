# Sealdown Real-time Collaboration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Markdown live documents edited by several people at once (Yjs over encrypted Supabase Realtime broadcast), with cursors, a current-state row and a checkpoint history; JSON live documents keep merge-on-save on the new storage.

**Architecture:** A Yjs provider exchanges encrypted, write-token-signed envelopes over the Realtime channel `sealdown-live-<id>`; a persistence module keeps one encrypted current state per document (`save_state`, optimistic revision) and creates checkpoints in `live_versions`. CodeMirror binds through `y-codemirror.next`. JSON pages keep the three-way merge, now against `revision` instead of `version`.

**Tech Stack:** yjs 13.6, y-protocols 1.0, y-codemirror.next 0.3, @supabase/realtime-js, WebCrypto (AES-GCM, HKDF, HMAC), Postgres/pgTAP + dbmate, Vitest, Playwright (local Supabase).

**Spec:** `docs/superpowers/specs/2026-10-22-sealdown-live-collab-design.md`

## Global Constraints

- Server sees ciphertext only; HMAC key = HKDF-SHA256(write token bytes, info `sealdown-live-write`); signature over `t + '\n' + s + '\n' + d`.
- Envelope `{ t, s, d, m? }`, event `m`, channel `sealdown-live-<id>`; `update`/`sync2`/`presence` must be signed; `sync1` and `saved` need not be.
- Batch local updates every 100 ms; presence ≤ 5/s; skip `sync2` > 200 KB.
- Save current state 2 s after the last local change; checkpoint every 5 min of activity and after 2 min of quiet; server skips automatic checkpoints within 60 s of the previous; keep 50 automatic; labelled ones never rotate.
- Limits: `state` ≤ 4 MB (4194304), `content` ≤ 1 MB. Errors: 42501, P0002, PT409, 53100, 23514.
- Seeding: Y.Doc with `clientID = 0` inserts the text into `Y.Text('md')`, then a random clientID.
- Markdown only in real time; JSON keeps merge + conflict dialog.
- Copy in en + pt locales; code/commits in English; analytics never carry content, names, links or keys.

## Review Focus

- Two tabs of one browser on one edit link (shared localStorage Yjs state, distinct awareness client ids) → both edit, no duplication (Task 6 e2e "two tabs of one browser").
- Laptop sleep / Realtime reconnect after minutes away → resync via `sync1`, nothing lost (Task 5 unit "rejoin resyncs").
- A document whose stored state is older than what peers hold, and no peer online → the newest stored state wins, no duplication (Task 5 unit "late joiner with no peers").
- Restoring a checkpoint while others type → one edit replacing the text, everyone converges (Task 7 e2e).
- Password-protected Markdown documents use the derived key for envelopes and state (Task 6 e2e "password document in real time").

---

### Task 1: Database — current state, checkpoints, old RPCs gone

**Files:** Create `db/migrations/20261025000000_live_collab.sql`, `supabase/tests/live_state.test.sql`; Modify `supabase/tests/live.test.sql`, `supabase/tests/live_password.test.sql`, `supabase/tests/docs.test.sql`; Delete `supabase/tests/live_autosave.test.sql`.

**Interfaces (Produces):** `create_live(content, author, write_hash, salt default null, state default null) → text`; `get_state(doc_id) → table(revision int, content text, state text, state_at timestamptz)`; `live_head(doc_id) → int` (revision); `save_state(doc_id, write_token, base_revision, content, state) → int`; `add_checkpoint(doc_id, write_token, content, authors, label default null) → int`; `list_versions(doc_id) → table(version, author, label, size_bytes, created_at)`; `get_live_version(doc_id, version) → table(content, author, label, created_at)`. Dropped: `get_live`, `save_version`, columns `writer`, `run_start`.

- [ ] **Step 1:** pgTAP `live_state.test.sql`: create → `get_state` revision 1 with content; `save_state` wrong token 42501, stale base PT409 (detail = current revision), right base → 2 and `state` stored; size checks 23514 (state > 4 MB); `add_checkpoint` within 60 s of the last automatic returns the existing version; 55 automatic checkpoints (60 s guard bypassed by backdating `created_at`) keep 50; labelled checkpoints survive the cap; `get_live`/`save_version` no longer exist; migration copied an existing document's newest version into `content`. Update the other test files to the new RPCs.
- [ ] **Step 2:** `pnpm db:test` → FAIL.
- [ ] **Step 3:** Migration up/down (down restores the previous functions and columns). Data copy: `update live_docs d set content = (newest version content)`.
- [ ] **Step 4:** `scripts/db-migrate.sh local up`, `pnpm db:test` → PASS; rollback + up → PASS.
- [ ] **Step 5:** Commit `feat(db): live current state and checkpoints`.

### Task 2: Storage client and JSON live on revisions

**Files:** Modify `src/storage/live.ts`, `src/live/session.ts`, `src/ui/LiveEditPage.tsx` (JSON path only), `src/ui/LiveReadPage.tsx`, `src/ui/VersionsPanel.tsx`; tests `tests/unit/storage/live.test.ts`, `tests/unit/live/session.test.ts`.

**Interfaces:**
- `LiveStorage`: `create(content, author, writeHash, salt?, state?)`, `state(id): Promise<{ revision; content; state: Uint8Array | null; stateAt }>`, `head(id)`, `saveState(id, token, base, content, state | null): Promise<number>`, `checkpoint(id, token, content, authors, label?): Promise<number>`, `version(id, n)`, `list(id)` (with `label: Uint8Array | null`), `salt(id)`. `latest`/`save` removed.
- `session.ts`: `openLive(route)` returns `{ doc, revision, state: Uint8Array | null, stateAt }`; JSON `saveDraft` uses `saveState` (state null) with PT409 → merge as today; `checkpointNow(route, text, authors, label?)`; `listVersions` decrypts `label` and `authors` (array of names).

- [ ] **Step 1:** Unit tests for each RPC body and mapping (PT409 carries `latest` revision), session round trips with the in-memory fake (revision increments, JSON stale merge still works, checkpoints with authors/labels decrypt).
- [ ] **Step 2–4:** FAIL → implement → `pnpm test` PASS, `pnpm typecheck` clean.
- [ ] **Step 5:** JSON live e2e still green: `pnpm test:e2e:stored tests/e2e/live*.spec.ts -g JSON`.
- [ ] **Step 6:** Commit `refactor: live documents on current state and revisions`.

### Task 3: Envelope crypto

**Files:** Create `src/live/collab/crypto.ts`; test `tests/unit/live/collab/crypto.test.ts`.

**Interfaces:** `type Envelope = { t: 'update' | 'sync1' | 'sync2' | 'presence' | 'saved'; s: string; d: string; m?: string }`; `macKey(token: string): Promise<CryptoKey>`; `seal(t, s, bytes, key, mac?: CryptoKey): Promise<Envelope>` (signs when `mac` given); `open(env, key, mac?): Promise<Uint8Array | null>` (null when a required signature is missing/invalid or decryption fails; `update`/`sync2`/`presence` require one).

- [ ] **Step 1:** Tests: round trip signed and unsigned; tampered `d` → null; signature from another token → null; unsigned `update` → null; unsigned `sync1` accepted; `m` over `t\ns\nd` (swapping `t` invalidates).
- [ ] **Step 2–5:** FAIL → implement → PASS → commit `feat: signed, encrypted collaboration envelopes`.

### Task 4: Realtime channel

**Files:** Create `src/live/collab/channel.ts`; Modify `src/live/realtime.ts` (keep `watchLive`/`announceLive` for JSON, sharing the client); test `tests/unit/live/collab/channel.test.ts` (fake transport).

**Interfaces:** `type Transport = { send(env: Envelope): void; onMessage(cb: (env: Envelope) => void): () => void; onStatus(cb: (s: 'connected' | 'offline') => void): () => void; close(): void }`; `realtimeTransport(id): Transport` (event `m`); `memoryHub(): { transport(): Transport }` for tests (broadcast to all others, drop own).

- [ ] **Step 1–5:** Tests on `memoryHub` (delivery to others only, status) → implement both → commit `feat: Realtime transport for live documents`.

### Task 5: Yjs provider and seeding

**Files:** Create `src/live/collab/provider.ts`, `src/live/collab/seed.ts`; test `tests/unit/live/collab/provider.test.ts`. Add deps `yjs`, `y-protocols`, `y-codemirror.next`.

**Interfaces:** `seedDoc(text: string): Y.Doc` (deterministic, `Y.Text('md')`); `class CollabProvider { constructor(opts: { doc: Y.Doc; awareness: Awareness; transport: Transport; key: string; token?: string }); status: 'connected' | 'offline'; on('status' | 'synced', cb); destroy() }` — batches local updates every 100 ms, sends `sync1` on connect/reconnect, answers `sync1` with `sync2` only with a token and ≤ 200 KB, applies verified `update`/`sync2`, relays awareness as signed `presence` throttled to 5/s.

- [ ] **Step 1:** Tests on `memoryHub`: two editors converge typing in the same spot; seeding the same text in two docs then exchanging → text once; a reader (no token) receives updates but its forged `update` is dropped by editors; a late joiner syncs via `sync1/sync2`; rejoin after `offline` resyncs; late joiner with no peers keeps its loaded state; awareness states (name, colour, cursor) reach others.
- [ ] **Step 2–5:** FAIL → implement → PASS → commit `feat: Yjs provider over encrypted envelopes`.

### Task 6: Persistence and the Markdown live editor

**Files:** Create `src/live/collab/persistence.ts`, `src/live/collab/checkpoints.ts`, `src/ui/LiveCollabEditor.tsx`, `src/ui/PresenceDots.tsx`; Modify `src/editor/CodeEditor.tsx` (optional `collab` extension prop), `src/ui/EditorPage.tsx` (live Markdown uses the collab editor; `incoming` removed), `src/ui/LiveEditPage.tsx` (Markdown branch), `src/ui/LiveReadPage.tsx` (Markdown live render), `src/ui/LiveBar.tsx` (presence + connection), locales, CSS; tests `tests/unit/live/collab/checkpoints.test.ts`, `tests/unit/live/collab/persistence.test.ts`, e2e `tests/e2e/live-collab.spec.ts`; rewrite Markdown parts of `tests/e2e/live.spec.ts` and `tests/e2e/live-history.spec.ts` (merge/conflict tests become JSON-only).

**Interfaces:** `checkpointDue(now, lastEdit, lastCheckpoint, editedSince): boolean` (5 min activity / 2 min quiet); `startPersistence({ route, doc, storage, authors(): string[] }) → { flush(): Promise<void>; stop(): void }` (save 2 s after last local change; PT409 → fetch state, `Y.applyUpdate`, retry; `localStorage` key `sealdown.ystate.<id>`); CodeEditor prop `collab?: Extension` (when set, `value`/`onChange` sync is off).

- [ ] **Step 1:** Unit: `checkpointDue` table; persistence with fake storage (debounce, PT409 merge, offline keeps local state). E2E: two contexts type on the same line → both end with both edits; remote cursor shows the other's name; reader updates within 1 s; a forged update sent from a read-link page is ignored; offline (`context.setOffline(true)`) edits sync after reconnect; an old document (seeded from text) opened by two pages at once shows its text once; two tabs of one browser; password document in real time; JSON live documents still merge.
- [ ] **Step 2–5:** FAIL → implement → PASS (`pnpm test`, `pnpm test:e2e:stored`, `pnpm test:e2e`) → commit `feat: real-time collaborative Markdown live documents`.

### Task 7: Versions — checkpoints, named versions, restore

**Files:** Modify `src/ui/VersionsPanel.tsx`, `src/ui/LiveEditPage.tsx`, locales; e2e in `tests/e2e/live-collab.spec.ts`.

**Interfaces:** Versions list shows label (pinned first group) or time + names; **Mark version** asks a name (dialog) → `checkpointNow(..., label)`; restore replaces `Y.Text` content in one transaction (Markdown) or saves as today (JSON).

- [ ] **Step 1:** E2E: mark "Approved" → listed pinned with the name; after edits restore it → both editors show the restored text; checkpoint lists both authors after two people edit.
- [ ] **Step 2–5:** FAIL → implement → PASS → commit `feat: checkpoint history and named versions`.

### Task 8: Analytics, docs, release

**Files:** `src/analytics.ts`, `README.md`; analytics e2e in `tests/e2e/live-errors.spec.ts`.

- [ ] **Step 1:** Events `version_named`, `collab_peers` (max peers, on page hide), `live_opened.realtime`; e2e asserts no text/names/token in sent events.
- [ ] **Step 2:** README (live documents section, links unchanged, Realtime, history), all suites: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm test:e2e:stored && pnpm test:visual && pnpm db:test`.
- [ ] **Step 3:** Final whole-branch review; fix Critical/Important.
- [ ] **Step 4:** Production migration, merge to `main`, deploy, then the two-browser check against the live site.
