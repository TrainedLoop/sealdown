# Sealdown live documents — Design

- **Date:** 2026-10-21
- **Status:** design approved in chat; this spec awaits review
- **Builds on:** `2026-10-15-sealdown-design.md`, `2026-10-19-sealdown-json-design.md`

## 1. Goal

Let several people keep one Markdown or JSON document up to date, each in their own time
(asynchronous, not real time). Whoever opens the link sees the latest version. Everything stays
encrypted in the browser, with no accounts; the server only stores ciphertext.

## 2. Decisions

| Topic | Decision |
|---|---|
| Model | A living document with versions. "Seal link" keeps producing fixed snapshots, unchanged. |
| Access | Two links: **edit** (read + write) and **read** (read only). The edit link holds a write token the read link lacks. No password option for now. |
| Write check | The server stores SHA-256 of the write token and accepts a version only with the matching token. |
| Concurrency | Optimistic: a save names its base version; a stale base is refused and the browser merges (three-way) and retries. Conflicts only when both sides changed the same part, resolved in a conflict screen. |
| Storage | One whole encrypted snapshot per version (approach A). No CRDT, no diff chains. |
| History | Last 50 versions per document: list, view, compare with current, restore (edit link). |
| Authors | No accounts: a name typed once, kept in the browser, stored encrypted with each version. |
| Saving | Local draft saved continuously in the browser; a version is published only by **Save version** (button or Ctrl/Cmd+S). |
| Space | Sealdown prunes itself inline whenever a create or save finds it above its 100 MB budget (besides the hourly job). The whole-database guard (450 MB) stays a refusal. |

## 3. Links and keys

- New random values per document: `id` (10 base62 characters, as today), content key `K` (AES-GCM-256, as today), write token `W` (32 random bytes, base64url).
- **Read link:** `#/l/<id>.<K>`. **Edit link:** `#/w/<id>.<K>.<W>`. The read link is the edit link without the token.
- Route kinds: `{kind: 'live-read', id, key}` and `{kind: 'live-edit', id, key, token}`; same trailing-junk stripping and validation as the existing routes (`id` base62 ×10, `K` and `W` base64url).
- Content per version: `compress → encodeDoc({type, text}) → AES-GCM(K)`, exactly as sealed links, so the type marker and both document types work unchanged.
- Author card per version: `AES-GCM(K)` of `{"name": "<name>"}` (empty name allowed), stored apart from the content so the version list never downloads documents.

## 4. Database (schema `sealdown`, new dbmate migration)

- `live_docs(id text pk, write_hash bytea not null, created_at, last_accessed_at)`, RLS on, no policies, no direct grants (as `docs`).
- `live_versions(doc_id text references live_docs on delete cascade, version int, content bytea ≤ 1 MB, author bytea ≤ 1 KB, created_at, primary key (doc_id, version))`.
- Functions (security definer, `search_path = ''`, executable by `anon`), base64 in and out as today:
  - `create_live(content text, author text, write_hash text) → text`: new id, version 1.
  - `get_live(doc_id text) → (version int, content text, author text, created_at timestamptz)`: latest version; bumps `last_accessed_at`; empty when missing.
  - `live_head(doc_id text) → int`: latest version number only (polling); null when missing. Does not bump access.
  - `get_live_version(doc_id text, version int) → (content, author, created_at)`.
  - `list_versions(doc_id text) → setof (version, author, size_bytes, created_at)`, newest first.
  - `save_version(doc_id text, write_token text, base_version int, content text, author text) → int`:
    - wrong token (`sha256(token) ≠ write_hash`) → error `42501`;
    - missing document → error `P0002`;
    - `base_version` not the latest → error `40001` with the latest version number in the message detail;
    - otherwise inserts `base_version + 1`, deletes versions older than the newest 50, bumps access, returns the new number.
- Guards on `create_live` and `save_version`:
  - whole database above `sealdown.max_database_bytes` → error `53100` (unchanged rule);
  - before inserting, if Sealdown's content (fixed docs + all live versions) is above its budget, run the pruning inline.
- `prune_docs(cap)` becomes one budget over both kinds: fixed documents and live documents (all their versions summed) are ranked together by `last_accessed_at`; the least recently opened are deleted until the total fits. Live documents are deleted whole (cascade).
- `ping()` unchanged. Migration `down` drops the new tables and functions and restores the old `prune_docs`.

## 5. Browser

### 5.1 Storage client
`src/storage/live.ts` with `createLive`, `getLive`, `liveHead`, `getVersion`, `listVersions`, `saveVersion`, mapping errors to `LiveError` kinds: `forbidden`, `missing`, `stale` (with `latest`), `full`, `network`, `too-large`.

### 5.2 Local state per live document
Key `sealdown.live.<id>` holds `{ base: number, baseText: string, draft: string }`. Kept apart from the Markdown and JSON drafts. The author name is `sealdown.author`.

### 5.3 Creating
Editor pages (Markdown and JSON) get **Share to edit** beside Seal link. It creates the live document from the current text and opens a dialog with the edit and read links (copy buttons, QR for each) and the note "Anyone with the edit link can change this document". The page's own draft is left as is. Without Supabase configured, the button is hidden.

### 5.4 Edit link (`#/w/...`)
- The same editor as the document's type, plus a **live bar**: "Live · v7 · Ana, 2 h ago", **Versions**, **Save version** (also Ctrl/Cmd+S), and the read link copy action.
- Typing updates only the local draft. Save version asks for a name the first time.
- Every 30 s while the tab is visible, `live_head`; when newer, the bar shows "Bruno saved v8 · Update". Update fetches it and merges it into the unsaved draft (§6).
- Saving with a stale base fetches the latest, merges, and saves again after any conflicts are resolved.
- No Seal link here; Export works as in the editor.

### 5.5 Read link (`#/l/...`)
The reader of the document's type, with the live bar (version, author, time, **Versions**) and the same polling; Update simply reloads the content.

### 5.6 Versions
A side panel listing number, author and date. Opening one shows its content and a diff against the current version (line diff for Markdown and JSON text). From the edit link, **Restore** saves that content as a new version.

### 5.7 Conflict screen
A dialog listing each conflict: Markdown hunks with **Mine**, **Theirs**, **Both** (mine then theirs); JSON paths with **Mine** or **Theirs**. **Save** applies the choices and saves on top of the latest version; **Cancel** keeps the draft unsaved.

## 6. Merge

- Always three-way: `base` (the version the draft started from), `mine` (the draft), `theirs` (the latest).
- **Markdown:** `node-diff3` line merge. Non-overlapping changes apply; overlapping, different changes become conflicts.
- **JSON:** when all three parse, a merge by JSON pointer: a value changed on one side only takes that side; changed on both to different values is a conflict; added/removed keys and array items follow the same rule per path (arrays compared by index). The result is printed with 2-space indentation. When any side doesn't parse, the whole document is one conflict (Mine / Theirs).
- `src/live/merge.ts` exports `mergeMarkdown(base, mine, theirs)` and `mergeJson(base, mine, theirs)`, both returning `{ text } | { conflicts, resolve(choices) → text }`.

## 7. Errors

| Case | What the person sees |
|---|---|
| Network or server down | "Couldn't save. Your changes are kept in this browser." Retry. |
| Document pruned | Both links: "This document was removed." An open draft can still be downloaded. |
| Wrong token | The edit link opens read-only with a notice. |
| Version over 1 MB | Save explains the limit. |
| Database guard | "Can't save right now." Draft kept. |

## 8. Analytics

New events, no content, names, links or keys (`route` and `doc_type` come from the existing context): `live_created`, `live_opened` (`access`: edit, read), `version_saved` (`merged`: bool, `conflicts`: number), `conflict_resolved`, `version_restored`, `versions_viewed`. Pageview routes `live-edit` and `live-read`.

## 9. Testing

- **Unit:** route parse/build for `#/l` and `#/w`; `mergeMarkdown` and `mergeJson` (clean, conflicting, both-sides-same, invalid JSON); `LiveError` mapping.
- **Database (pgTAP):** save needs the right token; stale base refused with the latest number; history capped at 50; inline pruning over the budget; `prune_docs` ranks both kinds and deletes live documents whole; database guard.
- **E2E (local Supabase):** create and open both links (Markdown and JSON); two pages editing — clean merge and the conflict screen; update notice; view and restore a version; read link can't save; pruned document message.

## 10. Out of scope

Real-time co-editing, presence, comments, per-person permissions, password-protected live documents, notifications outside the open tab.

## 11. Delivery

New branch, tested batches, merged to `main` when every suite is green, then deployed. The new migration is applied in production with `pnpm db:migrate` before the deploy.
