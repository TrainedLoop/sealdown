# Sealdown real-time collaboration — Design

- **Date:** 2026-10-22
- **Status:** design approved in chat; this spec awaits review
- **Builds on:** `2026-10-21-sealdown-live-design.md` (live documents) — replaces its Markdown editing model

## 1. Goal

Several people edit one live **Markdown** document at the same time and see each other type, with
cursors and names, as in Google Docs. Everything stays end-to-end encrypted: Supabase relays and
stores only ciphertext. JSON live documents keep today's model (autosave + three-way merge).

## 2. Decisions

| Topic | Decision |
|---|---|
| Model | CRDT with **Yjs** (`yjs`, `y-protocols`, `y-codemirror.next`, all MIT). No conflicts, no merge screen for Markdown. |
| Scope | Markdown live documents in real time. JSON live documents unchanged (autosave + merge), now also told about new versions over Realtime. |
| Transport | **Supabase Realtime broadcast** on `sealdown-live-<id>` (already verified: ~25 ms in production, public key). |
| Encryption | Every message encrypted with the document key (from the link, or derived from the password). |
| Write control | Messages that carry content are signed with an HMAC key derived from the write token; browsers drop anything without a valid signature. Read links can listen, never write. |
| Presence | Cursors and selections of editors with name and colour; presence dots in the live bar. Readers are not shown. |
| Storage | **Current state** (one row per document, overwritten) separated from **history** (checkpoints). |
| History | Automatic checkpoints every 5 min of activity and after 2 min of quiet, listing everyone who edited since the previous one; newest 50 kept. **Named versions** created by hand, never rotated out. |
| Offline | Edits keep working; the local Yjs state is kept in the browser and syncs on reconnect. |

## 3. Messages

Channel `sealdown-live-<id>`, broadcast event `m`. Payload (JSON):

```
{ t: 'update' | 'sync1' | 'sync2' | 'presence' | 'saved', s: <sender id>, d: <base64 IV+ciphertext>, m?: <base64 HMAC> }
```

- `d` is AES-GCM with the document key over the raw bytes of the Yjs/awareness message.
- `m` = HMAC-SHA256 over `t + '\n' + s + '\n' + d`, key = HKDF-SHA256(write token bytes, info `sealdown-live-write`). Required on `update`, `sync2` and `presence`; receivers verify before decrypting and drop invalid ones.
- `sync1` (a state vector: "what I have") needs no signature; editors answer with `sync2` (the missing updates). A `sync2` larger than 200 KB is not sent: the joiner gets it from the stored current state instead.
- `saved` (JSON documents and checkpoints): `d` holds the new revision number; it triggers a fetch, never an apply.
- Local edits are batched every 100 ms into one `update`. Presence updates are throttled to 5 per second.
- Messages from the same sender id as this tab are ignored.

## 4. Database (new dbmate migration)

- `live_docs` gains the **current state**: `state bytea` (IV + encrypted Yjs state, ≤ 4 MB; null for JSON), `content bytea` (IV + encrypted compressed text, ≤ 1 MB, as today's versions), `revision int not null default 1`, `state_at timestamptz`.
- `live_versions` becomes the **history**: each row is a checkpoint with `content` (text), `author` (encrypted card, now a list of names), `label bytea` (encrypted name for named versions, null for automatic), `created_at`. The `writer`/`run_start` collapse columns are dropped; `version` keeps numbering checkpoints.
- RPCs (security definer, `search_path = ''`, anon execute; errors as today: 42501 token, P0002 missing, PT409 stale, 53100 full, 23514 size):
  - `create_live(content, author, write_hash, salt default null, state default null) → id` — sets the current state (revision 1) and the first checkpoint.
  - `get_state(doc_id) → (revision, content, state, state_at)` — counts as an access.
  - `live_head(doc_id) → revision` — unchanged role (polling backup).
  - `save_state(doc_id, write_token, base_revision, content, state) → revision` — PT409 when `base_revision` isn't current; runs `make_room`.
  - `add_checkpoint(doc_id, write_token, content, authors, label default null) → version` — automatic ones (label null) are skipped (return the latest version) when one was made in the last 60 s; keeps the newest 50 automatic checkpoints, never deletes labelled ones.
  - `list_versions`, `get_live_version` return `label` too. `get_live` and `save_version` stay for one release for old clients, then go.
- Existing live documents: the migration copies each document's newest version into `content`, `revision = 1`, `state = null`.

## 5. Browser

### 5.1 Session (`src/live/collab/`)
- `crypto.ts`: `macKey(token)`, `seal(bytes, key)`, `open(bytes, key)`, `sign(...)`, `verify(...)`.
- `channel.ts`: joins the Realtime channel, encodes/decodes the envelopes, enforces signatures, batches updates.
- `provider.ts`: a Yjs provider: Y.Doc + awareness, `sync1` on join and on reconnect, answers `sync1` with `sync2` (editors only), applies verified updates, emits connection status.
- `persistence.ts`: saves the current state 2 s after the last local change (`save_state`; on PT409 fetch the stored state, `Y.applyUpdate` it, save again); decides checkpoints (5 min of activity / 2 min quiet) and sends `add_checkpoint` with the names of everyone who edited since the last one; keeps the Yjs state in `localStorage` for offline and reload.
- **Seeding**: a document with text but no Yjs state is seeded deterministically — a fresh Y.Doc with `clientID = 0` inserts the text into `Y.Text('md')`, then gets a random clientID — so two browsers seeding at once produce identical updates that merge without duplication.

### 5.2 Edit link (Markdown)
- CodeMirror with `yCollab(ytext, awareness, { undoManager })`: remote edits as they arrive, remote cursors and selections with name labels (fading after 3 s idle), Ctrl/Cmd+Z undoes only local edits.
- The live bar: presence dots with names, connection status (Connected / Offline · edits are sent when back), Versions.
- Removed for Markdown: conflict dialog, Saving/Unsaved status, three-way merge, the `incoming` channel.
- Versions panel: automatic checkpoints (time + names) and named versions (pinned, with their name); **Mark version** asks for a name; compare and restore as today (restore replaces the Y.Text content as one local edit, seen by everyone).

### 5.3 Read link
Joins the channel without signing anything, applies verified updates to a local Y.Doc, re-renders the Markdown at most every 300 ms. Not shown in presence.

### 5.4 Share
Unchanged: Share to edit moves the tab into the document; with a password the creator isn't asked.

### 5.5 JSON live documents
Keep autosave + three-way merge + conflict dialog, now on `save_state` / `get_state` (revision instead of version); after a save they send `saved` so others fetch at once; the 30 s check stays as backup; failed fetches retry in 5 s.

## 6. Errors

| Case | Behaviour |
|---|---|
| Realtime down | Status "Offline"; edits kept locally and in the stored state when `save_state` works; resync on reconnect. |
| Invalid signature / undecryptable message | Dropped silently (counted in a debug log only). |
| Wrong token | First `save_state` gets 42501: the page turns read-only with the existing notice. |
| Stored state too large | `save_state` refuses (23514): notice "This document is too large to keep live". |

## 7. Analytics

`live_opened` (`access`, `realtime`: bool), `version_named`, `collab_peers` (max peers seen in a session, sent on page hide). No content, names, links or keys.

## 8. Testing

- **Unit:** envelope sign/verify (tampered `d`, wrong token, missing `m`); deterministic seeding (two docs seeded separately then merged → text once); checkpoint timing rules; HKDF/HMAC vectors.
- **Database:** `save_state` token and PT409; `add_checkpoint` 60 s guard, 50-cap ignores labelled versions; migration copies existing documents.
- **E2E (local Supabase):** two editors typing on the same line converge; remote cursor with name; reader follows within 1 s; a forged update from a read-link page is ignored; offline edits sync on reconnect; an old live document opened by two pages at once has its text once; mark a version and restore it; JSON live documents still merge and get `saved` pushes; password documents work.

## 9. Delivery

Branch `feat/live-collab`. The commit already on `main` (Realtime announcements) has a failing CI test in the old Markdown model; it is superseded here and its tests are rewritten. Migration applied in production before the deploy.
