# rendermd v2 — Design

- **Date:** 2026-10-14
- **Status:** approved (scope confirmed in chat)
- **Builds on:** `2026-10-14-rendermd-design.md` (v1, live)

## 1. Goal

Make rendermd nicer to use day to day and to receive, without breaking its principles: no account, zero running cost, and no server ever reads a document.

## 2. Scope

In:

1. Link previews in chat apps (Open Graph / Twitter card tags, static image).
2. Open a `.md` file in the editor (file picker and drag and drop).
3. Optional password protection.
4. CodeMirror editor with Mermaid syntax errors marked inline.
5. "Insert diagram" menu with an example of every Mermaid diagram type.
6. Presentation mode.
7. QR code for generated links.
8. Privacy-safe usage metrics with the PostHog project of `danielporto-site`.

Out (decided): import from URL, iframe embeds, delete after first view.

## 3. Features

### 3.1 Link previews

Chat apps fetch the page HTML without running scripts and never see the fragment, so every link previews the same: title "rendermd", a one-line description and a 1200×630 image in the site's style (`public/og.png`). Tags: `og:title`, `og:description`, `og:image` (absolute URL), `og:type=website`, `twitter:card=summary_large_image`. Also a favicon.

### 3.2 Open a file

- **Open .md** button (accepts `.md`, `.markdown`, `.txt`, `text/markdown`, `text/plain`) and dropping a file on the editor.
- If the editor already has different, non-empty text, ask before replacing it (`window.confirm`).
- Files over 5 MB are refused with a message; the 1 MB stored-document cap still applies when sharing.

### 3.3 Password protection

- Editor checkbox **Protect with password** plus a password field. Generating a link with the box checked and an empty password is not allowed.
- Key derivation: PBKDF2-SHA256, 600 000 iterations, random 16-byte salt → AES-GCM 256. Bytes: `salt (16) || iv (12) || ciphertext`.
- New link formats, same size rule as unprotected links (inline when the base64url payload is ≤ 4096 characters):
  - `#/p/<payload>`: inline; payload = base64url of the bytes.
  - `#/q/<id>`: stored; the bytes go through the existing `create_doc` / `get_doc`.
- Reader: fetches (stored) or decodes (inline) the bytes, then asks for the password. A failed decryption shows "Wrong password" and lets the reader retry; with a password an AES-GCM failure means a wrong password.
- If storage is unavailable, a large protected document falls back to the long `#/p/` link, like unprotected ones.

### 3.4 CodeMirror editor

- CodeMirror 6 with Markdown highlighting, line wrapping, history and the default keymap. Loaded as a separate chunk; the editor area shows "Loading editor…" until it arrives.
- The content element is labeled with the existing placeholder text (accessible name) and keeps the Code | Preview toggle.
- **Mermaid lint:** about 600 ms after typing stops, each ```` ```mermaid ```` block is checked with `mermaid.parse` (Mermaid loaded on demand only when the document has such a block). An error underlines the block, on the reported line when Mermaid gives one, and shows Mermaid's message on hover.

### 3.5 Insert diagram

- A select labeled **Insert diagram** listing every diagram type. Choosing one inserts its example as a mermaid fence at the cursor and resets the select.
- The examples move from `tests/visual/reference.md` to `src/templates/diagrams.md`; the visual tests read them from there, so the menu and the tests stay in sync.

### 3.6 Presentation mode

- **Present** button on the reader. Slides split at horizontal rules (`---`), from the already-sanitized HTML. A document without rules is a single slide.
- Full-viewport overlay (and browser fullscreen when allowed). Next: →, Space, Page Down, swipe left. Previous: ←, Page Up, swipe right. Home / End jump. Esc closes. Counter "n / total". Diagrams, math and code hydrate per slide, light or dark with the current theme.

### 3.7 QR code

After a link is generated, a **QR code** button shows the link as a QR image (library loaded on demand). Links longer than 2000 characters show "This link is too long for a QR code" instead.

### 3.8 Metrics (PostHog)

Same PostHog project and privacy model as `danielporto-site`: loaded lazily, `persistence: 'memory'` (no cookies or storage), no autocapture, no automatic pageviews (the app sends `$pageview` itself, once per kind of page, with property `route`; pageleaves on, both with URLs cut down like every event), nothing when Do Not Track / Global Privacy Control is on or when `VITE_POSTHOG_KEY` is missing. Extra rules for rendermd:

- **No session recording** (it would record document text).
- **The URL never reaches PostHog.** The fragment holds documents and keys. A `before_send` hook rewrites `$current_url` and `$referrer` (and any other URL property) to origin + path, dropping query and fragment.
- **Only these events**, each with `app: 'rendermd'` and `lang`:

| Event | Properties |
|---|---|
| `app_opened` | `route`: editor, inline, stored, protected, error |
| `link_created` | `result`: ok, fallback, too_large, failed; `storage`: inline, stored; `protected`; `size_kb`; `diagram_count`; `diagram_types` (first keyword of each block) |
| `link_opened` | `storage`, `protected`, `ok`, `error` (LinkError kind) |
| `password_failed` | — |
| `export` | `format`: pdf, md, svg, png |
| `file_opened` | `via`: picker, drop |
| `diagram_inserted` | `type` |
| `present_started` | `slides` |
| `qr_shown` | — |

Build variables `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST`, copied from `danielporto-site`.

## 4. Testing

- Unit: password crypto (round trip, wrong password, tampered bytes), new route formats, link creation and opening with passwords, the `before_send` sanitizer, slide splitting, diagram template parsing, mermaid lint mapping.
- E2E: every feature's main flow and its error path. The e2e build points PostHog at a path on the preview server; a test captures those requests and asserts that no URL fragment, document text or key appears in them, and that no request happens with Do Not Track on.
- Existing suites keep passing; editor tests read the CodeMirror document instead of a textarea value.

## 5. Delivery

Four batches, each tested and deployed: (1) metrics, link previews, QR; (2) file opening, diagram menu, CodeMirror with lint; (3) passwords; (4) presentation mode.
