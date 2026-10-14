# rendermd

Paste or type Markdown, preview it, and share a link to the rendered document. Mermaid diagrams
(every type in the latest release), KaTeX math and highlighted code blocks are supported. No
account, no server-side rendering.

## How links work

| Link | Content |
|---|---|
| `#/v/<payload>` | Small documents: the whole document, deflate-compressed and base64url-encoded, in the URL. Nothing is stored anywhere. |
| `#/s/<id>.<key>` | Larger documents (over 4 KB encoded): encrypted in the browser with AES-GCM and stored in Supabase. The key exists only in the link. |

Everything after `#` stays in the browser; it is never sent to a server. Supabase only ever sees
ciphertext and cannot read stored documents. Stored documents never expire on a timer: when they
exceed rendermd's 100 MB budget, the least recently opened ones are removed first.

The Supabase project is shared with other small projects, so everything rendermd owns lives in the
`rendermd` schema. Add `rendermd` to the project's exposed schemas (Settings → API → Exposed
schemas, or `supabase config push`).

## Development

Requires Node (LTS), pnpm and Docker.

```sh
pnpm install
pnpm dev                # app at http://localhost:5173 (no Supabase: large documents fall back to long links)
pnpm test               # unit tests
pnpm db:start           # local Supabase in Docker
pnpm db:test            # database tests (pgTAP)
pnpm test:e2e           # end-to-end tests (Playwright in its Docker image)
pnpm test:e2e:stored    # end-to-end tests against the local Supabase
pnpm test:visual        # visual regression for every diagram type
```

To run the app against the local database, put the `API_URL` and `PUBLISHABLE_KEY` from
`pnpm exec supabase status` into `.env.local` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Keeping Mermaid current

Renovate opens a PR when Mermaid releases. CI renders `tests/visual/reference.md`, which holds one
example of every diagram type, and compares screenshots with the approved baselines. Review the
image diffs in the Playwright report.

When Mermaid adds a diagram type, add an example under its own `##` heading in
`tests/visual/reference.md`, then refresh and review the baselines:

```sh
pnpm test:visual --update-snapshots
```

Keep examples deterministic (for instance, give `gitGraph` commits explicit ids).

## Deployment

Pushes to `main` deploy to GitHub Pages once CI passes. The repository needs the variables
`SUPABASE_URL` and `SUPABASE_ANON_KEY` (the project's publishable key, which is public by design).
The `keepalive` workflow pings Supabase every three days so the free-tier project doesn't pause.
