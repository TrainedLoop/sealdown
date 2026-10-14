# rendermd

Paste or type Markdown, preview it, and share a link to the rendered document. Mermaid diagrams
(every type in the latest release), KaTeX math and highlighted code blocks are supported. No
account, no server-side rendering. Live at https://trainedloop.github.io/rendermd/.

## Features

- Markdown editor (CodeMirror) with a Code | Preview toggle, Mermaid syntax errors underlined as
  you type, an **Insert diagram** menu with an example of every diagram type, and **Open .md**
  (or drop a file on the editor).
- Optional **password protection**: the key is derived from the password and never travels in the
  link.
- Reader with table of contents, light/dark theme, English/Portuguese, **Edit a copy**, export to
  PDF, `.md`, SVG and PNG, and a **Present** mode that turns `---`-separated sections into slides.
- QR code for generated links, and a link preview image for chat apps.

## How links work

| Link | Content |
|---|---|
| `#/v/<payload>` | Small documents: the whole document, deflate-compressed and base64url-encoded, in the URL. Nothing is stored anywhere. |
| `#/s/<id>.<key>` | Larger documents (over 4 KB encoded): encrypted in the browser with AES-GCM and stored in Supabase. The key exists only in the link. |
| `#/p/<payload>` | Password-protected, small: the ciphertext in the URL. |
| `#/q/<id>` | Password-protected, large: stored in Supabase. |

Protected documents use a key derived from the password with PBKDF2-SHA256 (600 000 iterations,
random salt) and AES-GCM; neither the password nor the key is in the link. Stored protected
documents are fetched once, and password attempts happen in the browser.

Everything after `#` stays in the browser; it is never sent to a server. Supabase only ever sees
ciphertext and cannot read stored documents. Stored documents never expire on a timer: when they
exceed rendermd's 100 MB budget, the least recently opened ones are removed first.

The Supabase project is shared with other small projects, so everything rendermd owns lives in the
`rendermd` schema. Add `rendermd` to the project's exposed schemas (Settings → API → Exposed
schemas). Avoid `supabase config push`: it would overwrite settings other projects rely on.

## Metrics and privacy

Usage metrics go to PostHog (the same project as danielporto-site), loaded after the page is idle:
no cookies or storage, no autocapture and **no session recording**, since
recordings would capture documents. The URL fragment holds documents and keys, so a `before_send`
hook cuts every URL in an event to origin + path. Pageviews (for Web Analytics) are sent once per kind
of page with a `route` property, so every document counts as the same page. Nothing is sent with Do Not Track or Global
Privacy Control on, or when `VITE_POSTHOG_KEY` is missing. PostHog also drops events from
automated browsers.

Every event carries `app: rendermd` and `lang`:

| Event | Properties |
|---|---|
| `$pageview` | `route`: editor, inline, stored, protected, error |
| `app_opened` | `route` (first page of the visit) |
| `link_created` | `result`, `storage`, `protected`, `size_kb`, `diagram_count`, `diagram_types` |
| `link_opened` | `storage`, `protected`, `ok`, `error` |
| `password_failed` | — |
| `export` | `format`: pdf, md, svg, png |
| `file_opened` | `via`: picker, drop |
| `diagram_inserted` | `type` |
| `present_started` | `slides` |
| `qr_shown` | — |

## Development

Requires Node (LTS), pnpm and Docker.

```sh
pnpm install
pnpm dev                # app at http://localhost:5173 (no Supabase: large documents fall back to long links)
pnpm test               # unit tests
pnpm db:start           # local Supabase in Docker, then apply migrations
pnpm db:reset           # wipe the local database and re-apply migrations
pnpm db:test            # database tests (pgTAP)
pnpm test:e2e           # end-to-end tests (Playwright in its Docker image)
pnpm test:e2e:stored    # end-to-end tests against the local Supabase
pnpm test:visual        # visual regression for every diagram type
```

To run the app against the local database, put the `API_URL` and `PUBLISHABLE_KEY` from
`pnpm exec supabase status` into `.env.local` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Database migrations

The Supabase project is shared with other projects, and the Supabase CLI keeps a single migration
history per database. So rendermd uses [dbmate](https://github.com/amacneil/dbmate) instead, with
its history in `rendermd.schema_migrations`: each project tracks only its own migrations and never
blocks another.

- Migrations live in `db/migrations` as plain SQL with `-- migrate:up` / `-- migrate:down` sections.
  Create one with `pnpm db:migrate local new <name>`.
- Locally, `pnpm db:start` and `pnpm db:reset` apply them. `supabase/seed.sql` only creates the empty
  schema so the local API can start before dbmate runs.
- In production, apply pending migrations with the session pooler URI from the dashboard
  (Connect → Session pooler). Put it in `.env.local`, which git ignores and Vite never exposes:

  ```sh
  # .env.local
  DATABASE_URL=postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres?sslmode=require
  ```

  Then `pnpm db:migrate` (or `pnpm db:migrate status`).

## Keeping Mermaid current

Dependency updates are manual for now (an automated agent may take this over later). To update
Mermaid:

```sh
pnpm up mermaid @mermaid-js/mermaid-zenuml --latest
pnpm test:visual
```

`src/templates/diagrams.md` holds one example of every diagram type; the visual tests compare
their screenshots with the approved baselines. Review any image diffs in the Playwright report,
then refresh the baselines:

```sh
pnpm test:visual --update-snapshots
```

When Mermaid adds a diagram type, add an example under its own `##` heading in
`src/templates/diagrams.md` and refresh the baselines. Keep examples deterministic (for instance,
give `gitGraph` commits explicit ids). The Playwright Docker image tag follows `@playwright/test`,
so updating Playwright also changes screenshots.

## Deployment

Pushes to `main` deploy to GitHub Pages once CI passes. The repository needs the variables
`SUPABASE_URL` and `SUPABASE_ANON_KEY` (the project's publishable key, which is public by design).
The `keepalive` workflow pings Supabase every three days so the free-tier project doesn't pause.
