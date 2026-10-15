# Sealdown — Design

- **Date:** 2026-10-15
- **Status:** approved in chat (visual choices made in the brainstorming companion)
- **Supersedes the product name** of the v1–v3 specs (rendermd). The v3 batch C items are folded in here.

## 1. Goal

Rename the product to **Sealdown** and rebuild its look around what makes it different: every document is sealed (encrypted) in the browser, optionally with a password. The interface is beautiful and modern, English first with a Portuguese option, and follows render-md.com's proven layout (top bar with centered modes, formatting toolbar, editor beside a paper preview, status bar).

## 2. Decisions

| Topic | Decision |
|---|---|
| Name | Sealdown everywhere: repo, site path, UI, docs, code, database schema, browser storage keys, analytics. |
| Old links | The only remaining `rendermd` is a tiny redirect repository so links already shared keep opening. |
| Encryption | Every new link is encrypted, small ones included. The password is a first-class field next to the main button. |
| Identity | "Vault": dark by default (light variant via the theme toggle), mint accent, monospace wordmark with a lock. |
| Sharing | "Seal link" opens a centered modal with an animated seal. |
| Reading | Top bar with title and actions, contents on the left, paper in the center, "Unsealed only in this browser" badge. |
| Language | English by default; Portuguese from the language toggle (unchanged). |

## 3. Rename and migration

### 3.1 Repository and site
- `TrainedLoop/rendermd` is renamed to `TrainedLoop/sealdown`; the site moves to `https://trainedloop.github.io/sealdown/`.
- A new repository `TrainedLoop/rendermd` publishes only `index.html` and `404.html`, which replace the location with `https://trainedloop.github.io/sealdown/` + the original fragment. Nothing else lives there.
- The local folder becomes `~/projetos/pessoal/sealdown`; spec and plan files are renamed and their text updated.

### 3.2 Database
- Everything in schema `rendermd` moves to schema `sealdown` (table, functions, grants, cron job renamed `sealdown-prune-docs`, guard setting `sealdown.max_database_bytes`, history table `sealdown.schema_migrations`). Stored documents are kept.
- The repository's migration is rewritten for the new schema (fresh local databases come up directly as `sealdown`). Production is moved once by `db/one-off/2026-10-15-rename-schema.sql`, run with the production `DATABASE_URL`: rename the schema, recreate the functions (their bodies reference the schema by name), re-grant, reschedule the cron job, and record the migration version so dbmate stays in sync.
- The project's exposed API schemas must list `sealdown` instead of `rendermd` (dashboard setting, done by the owner).
- Order in production: run the SQL → update exposed schemas → deploy the renamed site. Between the first and last step, the old site cannot store or open stored documents (minutes).

### 3.3 Browser storage
Keys become `sealdown.draft`, `.theme`, `.lang`, `.mode`, `.syncScroll`, `.typeset`. On first load, each existing `rendermd.*` value is copied to its new key when the new key is empty, then the old key is removed.

### 3.4 Analytics
Events carry `app: 'sealdown'`.

## 4. Encryption everywhere

- New inline format `#/e/<ciphertext>.<key>`: compressed text, AES-GCM-256 with a random key and IV, base64url; the key follows the dot.
- Inline vs stored keeps the 4096-character rule, measured on the encrypted payload.
- Password links unchanged (`#/p/`, `#/q/`); stored links unchanged (`#/s/`).
- Storage unavailable → fallback to a long `#/e/` link (still encrypted).
- `#/v/` links (plaintext, compressed) still open; they are never generated again.

## 5. Visual identity — "Vault"

- Dark palette (default): background `#0f1419`, surfaces `#141c23`/`#161f27`, borders `#1f2a33`/`#2b3a46`, text `#dbe4ea`, muted `#7f95a5`, accent mint `#2dd4a7` (text on accent `#06281f`), seal badge `#10342b`/`#4ee3b8`. A matching light palette for the toggle.
- Wordmark: `sealdown` in a monospace face with a lock glyph. UI text in a modern sans; editor and status bar in monospace. System fonts only, no web fonts.
- New favicon and link-preview image in this identity.
- Design is refined with the frontend-design skill; mockups from the brainstorming session are the reference.

## 6. Screens

### 6.1 Editor
- **Top bar:** wordmark / document title · Write | Split | Read (centered) · Open · Export (menu: PDF, .md) · Aa · theme · language · password field (placeholder "Password (optional)") · **Seal link** (primary).
- **Toolbar, editor and preview** as in v3; the preview is a paper card on a dotted canvas.
- **Status bar:** counts and reading time · sync toggle (split) · saved state · "🔒 AES-256 · key never leaves the link".
- The "Protect with password" checkbox is removed: a non-empty password protects the link.

### 6.2 Seal modal
Animated seal, "Document sealed", the link (already copied) with Copy, chips (AES-256; with password or not; short link or in the link), QR code, the reminder "Send the password through another channel" when protected. Too-large, storage-unavailable and generation errors show inside the modal. Esc or the close button returns to the editor.

### 6.3 Reader
- **Locked:** centered card with the seal, "Document sealed", password field, **Unseal**.
- **Open:** top bar with title and actions (Aa, Export, Present, **Edit a copy**), contents on the left, paper in the center with the "Unsealed only in this browser" badge.

## 7. Folded in from v3 batch C and pending items
- **Aa** menu: typeset styles Modern, Editorial, Technical (saved; applies to reading and slides).
- **Command palette** (search icon and Ctrl/Cmd+K), Downshift-based.
- **Mermaid hints:** a `;` inside a sequence-diagram message and `{`/`}` inside a state-diagram label get a clear hint, in the reader's error box and the editor's lint, also when Mermaid does not fail but draws something else.

## 8. Testing
Existing suites follow the new labels and names. New tests: `#/e/` round trip and legacy `#/v/`; storage-key migration; seal modal; unseal card; redirect page preserves the fragment; schema rename SQL against a local database seeded with a document (document still opens afterwards); Mermaid hints. Visual baselines are regenerated for the new identity.

## 9. Delivery
1. Encryption everywhere + seal modal.
2. Rename (code, storage keys, docs, database, repository, redirect).
3. Identity and editor layout.
4. Reader and unseal.
5. Aa, command palette, Mermaid hints.
