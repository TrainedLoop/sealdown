import type { PostHog } from 'posthog-js'
import { i18n } from './i18n/index.ts'

/**
 * Usage metrics with PostHog (the same project as danielporto-site), loaded after the page is
 * idle in a separate chunk.
 *
 * Privacy: no cookies or storage (persistence "memory"), no autocapture, no automatic pageviews,
 * no session recording (it would record documents) and no extra PostHog scripts. The URL fragment
 * holds documents and decryption keys, so every URL in an event is cut down to origin + path
 * before sending. Only the events below are sent; none carries document text. With Do Not Track
 * or Global Privacy Control on, or without VITE_POSTHOG_KEY in the build, nothing is sent.
 */

export type EventName =
  | 'app_opened'
  | 'link_created'
  | 'link_opened'
  | 'password_failed'
  | 'export'
  | 'file_opened'
  | 'diagram_inserted'
  | 'present_started'
  | 'qr_shown'

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

function sanitizeProps(props: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!props) return props
  return Object.fromEntries(Object.entries(props).map(([k, v]) => [k, typeof v === 'string' ? stripUrl(v) : v]))
}

/** Cuts every URL-looking string property down to origin + path (no query, no fragment). */
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

/** First keyword of each ```mermaid block: diagram types without their content. */
export function diagramTypes(text: string): string[] {
  return Array.from(text.matchAll(/^```mermaid[^\S\n]*\n\s*([A-Za-z][\w-]*)/gm), (m) => m[1])
}

function optedOut(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
  const win = window as Window & { doNotTrack?: string }
  return nav.doNotTrack === '1' || win.doNotTrack === '1' || nav.globalPrivacyControl === true
}

const enabled = Boolean(KEY) && !optedOut()
let client: PostHog | null = null
const queue: [EventName, Props][] = []

export function track(event: EventName, props?: Props): void {
  if (!enabled) return
  const withLang = { lang: i18n.language, ...props }
  if (client) client.capture(event, withLang)
  else queue.push([event, withLang])
}

async function load() {
  const { default: posthog } = await import('posthog-js')
  posthog.init(KEY!, {
    api_host: HOST,
    persistence: 'memory',
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
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
  posthog.register({ app: 'rendermd' })
  client = posthog
  for (const [event, props] of queue.splice(0)) posthog.capture(event, props)
}

if (enabled) {
  const start = () => void load().catch(() => undefined)
  if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 3000 })
  else setTimeout(start, 1000)
}
