import type { Mermaid } from 'mermaid'
import { track } from '../analytics.ts'
import { i18n } from '../i18n/index.ts'
import type { Theme } from '../ui/theme.ts'
import { downloadBlob, svgToPngBlob } from '../ui/download.ts'
import { openLightbox } from './lightbox.ts'
import { createNotice } from './notice.ts'

let loading: Promise<Mermaid> | undefined
let counter = 0
// Theme changes can start a new pass while one is running; only the latest pass may write.
const passes = new WeakMap<HTMLElement, number>()

function loadMermaid(): Promise<Mermaid> {
  loading ??= (async () => {
    const [{ default: mermaid }, { default: zenuml }] = await Promise.all([
      import('mermaid'),
      import('@mermaid-js/mermaid-zenuml'),
    ])
    await mermaid.registerExternalDiagrams([zenuml])
    return mermaid
  })().catch((error: unknown) => {
    loading = undefined
    throw error
  })
  return loading
}

// mermaid.initialize() is global and not queued with renders, so every initialize + render pair
// runs on this chain; otherwise an export render could pick up a hydrate pass's config or vice versa.
let queue: Promise<unknown> = Promise.resolve()

function renderSvg(source: string, theme: Theme, htmlLabels: boolean): Promise<string> {
  const run = queue.then(async () => {
    const mermaid = await loadMermaid()
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: theme === 'dark' ? 'dark' : 'default',
      htmlLabels,
    })
    const id = `rmd-${++counter}`
    try {
      return (await mermaid.render(id, source)).svg
    } finally {
      // On a syntax error Mermaid leaves its scratch elements in <body>.
      document.getElementById(id)?.remove()
      document.getElementById(`d${id}`)?.remove()
    }
  })
  queue = run.catch(() => undefined)
  return run
}

// Matches --surface in styles.css, so PNGs look like the page they came from.
const PNG_BACKGROUND: Record<Theme, string> = { light: '#ffffff', dark: '#1e1f23' }

function actionButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = label
  button.addEventListener('click', onClick)
  return button
}

function diagramActions(figure: HTMLElement, index: number, theme: Theme): HTMLElement {
  const actions = document.createElement('div')
  actions.className = 'diagram-actions'
  actions.setAttribute('role', 'group')
  actions.setAttribute('aria-label', i18n.t('export.diagramActions'))
  const name = `diagram-${index + 1}`
  const showProblem = (message: string) => {
    figure.querySelector('.png-failed')?.remove()
    const notice = createNotice(message)
    notice.classList.add('png-failed')
    actions.after(notice)
  }
  const pngOf = async () =>
    svgToPngBlob(await renderDiagramForExport(figure.dataset.source ?? '', theme), PNG_BACKGROUND[theme])

  const expand = actionButton(i18n.t('diagram.expand'), () => {
    const svg = figure.querySelector<SVGSVGElement>('.diagram-svg > svg')
    if (!svg) return
    track('diagram_expanded')
    openLightbox(svg, expand)
  })
  const copyImage = actionButton(i18n.t('diagram.copy'), async () => {
    figure.querySelector('.png-failed')?.remove()
    try {
      // A promise inside ClipboardItem keeps the user gesture valid while the PNG renders (Safari).
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngOf() })])
      track('diagram_copied', { ok: true })
      copyImage.textContent = i18n.t('code.copied')
      setTimeout(() => (copyImage.textContent = i18n.t('diagram.copy')), 2000)
    } catch {
      track('diagram_copied', { ok: false })
      showProblem(i18n.t('errors.copyImage'))
    }
  })
  actions.append(
    expand,
    copyImage,
    actionButton(i18n.t('export.svg'), () => {
      track('export', { format: 'svg' })
      const svg = figure.querySelector('.diagram-svg > svg')
      // XML serialization: outerHTML would write <br> inside labels as unclosed HTML.
      if (svg) downloadBlob(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }), `${name}.svg`)
    }),
    actionButton(i18n.t('export.png'), async () => {
      figure.querySelector('.png-failed')?.remove()
      track('export', { format: 'png' })
      try {
        downloadBlob(await pngOf(), `${name}.png`)
      } catch {
        // Some diagram types still produce markup the browser refuses to rasterize.
        showProblem(i18n.t('errors.png'))
      }
    }),
  )
  return actions
}


/** Turns `pre.mermaid-src` placeholders into `figure.diagram` elements; later passes re-render them. */
export function collectDiagrams(container: HTMLElement): HTMLElement[] {
  for (const pre of container.querySelectorAll('pre.mermaid-src')) {
    const figure = document.createElement('figure')
    figure.className = 'diagram'
    figure.dataset.source = (pre.textContent ?? '').replace(/\n$/, '')
    const line = pre.getAttribute('data-source-line')
    if (line) figure.setAttribute('data-source-line', line)
    const fallback = document.createElement('pre')
    fallback.textContent = figure.dataset.source
    figure.append(fallback)
    pre.replaceWith(figure)
  }
  return Array.from(container.querySelectorAll<HTMLElement>('figure.diagram'))
}

export async function renderDiagrams(container: HTMLElement, theme: Theme): Promise<void> {
  const figures = collectDiagrams(container)
  if (figures.length === 0) return
  const pass = (passes.get(container) ?? 0) + 1
  passes.set(container, pass)

  // Mermaid sizes boxes by measuring label text, so fonts must be loaded first.
  await Promise.all([loadMermaid(), document.fonts.ready])
  for (const [index, figure] of figures.entries()) {
    if (passes.get(container) !== pass) return
    const source = figure.dataset.source ?? ''
    let content: HTMLElement
    try {
      const svg = await renderSvg(source, theme, true)
      content = document.createElement('div')
      content.className = 'diagram-svg'
      content.innerHTML = svg
    } catch (error) {
      content = createNotice(`${i18n.t('errors.diagram')} ${error instanceof Error ? error.message : String(error)}`)
      const pre = document.createElement('pre')
      pre.textContent = source
      content.append(pre)
    }
    if (passes.get(container) !== pass) return
    if (content.classList.contains('diagram-svg')) figure.replaceChildren(content, diagramActions(figure, index, theme))
    else figure.replaceChildren(content)
  }
}

/** Throws Mermaid's parse error for invalid source (used by the editor's lint). */
export async function parseDiagram(source: string): Promise<void> {
  const mermaid = await loadMermaid()
  await mermaid.parse(source)
}

/** SVG for downloads: plain-text labels, because HTML labels (foreignObject) taint a canvas. */
export function renderDiagramForExport(source: string, theme: Theme): Promise<string> {
  return renderSvg(source, theme, false)
}
