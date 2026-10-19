import type { PostHog } from 'posthog-js'
import { i18n } from './i18n/index.ts'

/**
 * Usage metrics with PostHog (the same project as danielporto-site), loaded after the page is
 * idle in a separate chunk.
 *
 * Privacy: no cookies or storage (persistence "memory"), no autocapture, no session recording (it
 * would record documents) and no extra PostHog scripts. The URL fragment holds documents and
 * decryption keys, so every URL in an event is cut down to origin + path before sending; that
 * includes the pageviews sent for Web Analytics, so every document counts as the same page. Only
 * the events below are sent; none carries document text. With Do Not Track
 * or Global Privacy Control on, or without VITE_POSTHOG_KEY in the build, nothing is sent.
 */

export type EventName =
  | '$pageview'
  | 'app_opened'
  | 'link_created'
  | 'link_opened'
  | 'password_failed'
  | 'export'
  | 'file_opened'
  | 'diagram_inserted'
  | 'present_started'
  | 'qr_shown'
  | 'mode_changed'
  | 'typeset_changed'
  | 'command_run'
  | 'format_applied'
  | 'code_copied'
  | 'diagram_expanded'
  | 'diagram_copied'

type Props = Record<string, string | number | boolean | string[]>

const KEY = import.meta.env.VITE_POSTHOG_KEY
const HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'

function stripUrl(value: string): string {
  if (!/^https?:\/\//i.test(value)) return value
  try {
    const url = new URL(value)
    return url.origin + url.pathname
  } catch {
    return value
  }
}

// PostHog attaches document.title to pageviews, and the tab title is the document's title.
const DROPPED_PROPS = new Set(['title', '$title'])

function sanitizeProps(props: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!props) return props
  return Object.fromEntries(
    Object.entries(props)
      .filter(([k]) => !DROPPED_PROPS.has(k))
      .map(([k, v]) => [k, typeof v === 'string' ? stripUrl(v) : v]),
  )
}

/** Drops page titles and cuts every URL-looking string property down to origin + path. */
export function sanitizeEvent<
  T extends { properties?: Record<string, unknown>; $set?: Record<string, unknown>; $set_once?: Record<string, unknown> },
>(event: T): T {
  return {
    ...event,
    properties: sanitizeProps(event.properties),
    ...(event.$set && { $set: sanitizeProps(event.$set) }),
    ...(event.$set_once && { $set_once: sanitizeProps(event.$set_once) }),
  }
}

// Mermaid's diagram keywords (12.x). Anything else in a block is document text and is never sent.
const DIAGRAM_KEYWORDS = new Set([
  'graph', 'flowchart', 'flowchart-elk', 'sequenceDiagram', 'classDiagram', 'classDiagram-v2', 'stateDiagram',
  'stateDiagram-v2', 'erDiagram', 'journey', 'gantt', 'pie', 'quadrantChart', 'requirementDiagram', 'requirement',
  'gitGraph', 'C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment', 'mindmap', 'timeline',
  'zenuml', 'sankey', 'sankey-beta', 'xychart', 'xychart-beta', 'block', 'block-beta', 'packet', 'packet-beta',
  'kanban', 'architecture', 'architecture-beta', 'radar-beta', 'treemap', 'treemap-beta', 'swimlane-beta',
  'usecase-beta', 'agentflow-beta', 'eventmodeling', 'venn-beta', 'ishikawa', 'ishikawa-beta', 'wardley-beta',
  'cynefin-beta', 'treeView-beta', 'railroad-beta', 'railroad-ebnf-beta', 'railroad-abnf-beta', 'railroad-peg-beta',
  'info',
])

/** Diagram type of each ```mermaid block; unknown first words become "other" so no document text leaks. */
export function diagramTypes(text: string): string[] {
  return Array.from(text.matchAll(/^```mermaid[^\S\n]*\n\s*([A-Za-z][\w-]*)/gm), (m) =>
    DIAGRAM_KEYWORDS.has(m[1]) ? m[1] : 'other',
  )
}

function pick(ctx: Context): Props {
  return Object.fromEntries(Object.entries(ctx).filter(([, v]) => v !== undefined)) as Props
}

function optedOut(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
  const win = window as Window & { doNotTrack?: string }
  return nav.doNotTrack === '1' || win.doNotTrack === '1' || nav.globalPrivacyControl === true
}

// Where the event happened: the kind of page (`route`) and, on a page showing a document, its type.
// Both are set by the app shell and the pages, so every event carries them without each call site.
type Context = { route?: string; doc_type?: string }
const context: Context = {}

export function setAnalyticsContext(next: Context): void {
  Object.assign(context, next)
}

const enabled = Boolean(KEY) && !optedOut()
let client: PostHog | null = null
const queue: [EventName, Props][] = []

export function track(event: EventName, props?: Props): void {
  if (!enabled) return
  const withLang = { lang: i18n.language, ...pick(context), ...props }
  if (client) client.capture(event, withLang)
  else queue.push([event, withLang])
}

/** A pageview for PostHog's Web Analytics; `route` is the kind of page (editor, json-editor, inline, …), never the URL. */
export function trackPageview(route: string): void {
  track('$pageview', { route })
}

async function load() {
  const { default: posthog } = await import('posthog-js')
  posthog.init(KEY!, {
    api_host: HOST,
    persistence: 'memory',
    autocapture: false,
    capture_pageview: false,
    // Pageviews are sent by the app per route kind (trackPageview); pageleaves give Web Analytics durations.
    capture_pageleave: true,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    capture_exceptions: false,
    capture_performance: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_external_dependency_loading: true,
    advanced_disable_flags: true,
    save_referrer: false,
    // Tiny traffic; plain JSON keeps what is sent inspectable (the e2e tests read it).
    disable_compression: true,
    request_batching: false,
    before_send: (event) => (event ? sanitizeEvent(event) : event),
  })
  posthog.register({ app: 'sealdown' })
  client = posthog
  for (const [event, props] of queue.splice(0)) posthog.capture(event, props)
}

if (enabled) {
  const start = () => void load().catch(() => undefined)
  if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 3000 })
  else setTimeout(start, 1000)
}
