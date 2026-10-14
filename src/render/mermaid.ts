import type { Mermaid } from 'mermaid'
import { i18n } from '../i18n/index.ts'
import type { Theme } from '../ui/theme.ts'
import { downloadBlob, svgToPngBlob } from '../ui/download.ts'
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

function configure(mermaid: Mermaid, theme: Theme, htmlLabels = true) {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: theme === 'dark' ? 'dark' : 'default',
    htmlLabels,
  })
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
  actions.append(
    actionButton(i18n.t('export.svg'), () => {
      const svg = figure.querySelector('.diagram-svg svg')
      if (svg) downloadBlob(new Blob([svg.outerHTML], { type: 'image/svg+xml' }), `${name}.svg`)
    }),
    actionButton(i18n.t('export.png'), async () => {
      const svg = await renderDiagramForExport(figure.dataset.source ?? '', theme)
      downloadBlob(await svgToPngBlob(svg, PNG_BACKGROUND[theme]), `${name}.png`)
    }),
  )
  return actions
}

async function renderSvg(mermaid: Mermaid, source: string): Promise<string> {
  const id = `rmd-${++counter}`
  try {
    return (await mermaid.render(id, source)).svg
  } finally {
    // On a syntax error Mermaid leaves its scratch elements in <body>.
    document.getElementById(id)?.remove()
    document.getElementById(`d${id}`)?.remove()
  }
}

/** Turns `pre.mermaid-src` placeholders into `figure.diagram` elements; later passes re-render them. */
export function collectDiagrams(container: HTMLElement): HTMLElement[] {
  for (const pre of container.querySelectorAll('pre.mermaid-src')) {
    const figure = document.createElement('figure')
    figure.className = 'diagram'
    figure.dataset.source = (pre.textContent ?? '').replace(/\n$/, '')
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

  const mermaid = await loadMermaid()
  for (const [index, figure] of figures.entries()) {
    if (passes.get(container) !== pass) return
    const source = figure.dataset.source ?? ''
    configure(mermaid, theme)
    let content: HTMLElement
    try {
      const svg = await renderSvg(mermaid, source)
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

/** SVG for downloads: plain-text labels, because HTML labels (foreignObject) taint a canvas. */
export async function renderDiagramForExport(source: string, theme: Theme): Promise<string> {
  const mermaid = await loadMermaid()
  configure(mermaid, theme, false)
  try {
    return await renderSvg(mermaid, source)
  } finally {
    configure(mermaid, theme)
  }
}
