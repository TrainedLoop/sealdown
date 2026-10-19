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

// Diagrams in Sealdown's colors: mint outlines on the paper's surface, IBM Plex labels.
const FONT = "'IBM Plex Sans Variable', 'IBM Plex Sans', system-ui, sans-serif"
const DIAGRAM_THEMES: Record<Theme, Record<string, string | boolean>> = {
  dark: {
    darkMode: true,
    fontFamily: FONT,
    background: '#161f27',
    mainBkg: '#223441',
    primaryColor: '#223441',
    primaryBorderColor: '#2dd4a7',
    primaryTextColor: '#dbe4ea',
    secondaryColor: '#18222b',
    secondaryBorderColor: '#4a6070',
    tertiaryColor: '#141c23',
    tertiaryBorderColor: '#2b3a46',
    lineColor: '#8a9fae',
    textColor: '#dbe4ea',
    noteBkgColor: '#10342b',
    noteTextColor: '#dbe4ea',
    noteBorderColor: '#2dd4a7',
    clusterBkg: '#141c23',
    clusterBorder: '#2b3a46',
    edgeLabelBackground: '#161f27',
    actorBkg: '#223441',
    actorBorder: '#2dd4a7',
    actorTextColor: '#dbe4ea',
    signalColor: '#dbe4ea',
    signalTextColor: '#dbe4ea',
    pieStrokeColor: '#161f27',
    pieStrokeWidth: '2px',
    pieOpacity: '1',
    pieOuterStrokeColor: '#161f27',
    pieSectionTextColor: '#0f1419',
    pieTitleTextColor: '#dbe4ea',
    pieLegendTextColor: '#dbe4ea',
    // Categorical series (validated, fixed order): pie slices, mindmap/timeline/journey sections, git branches.
    pie1: '#3987e5',
    pie2: '#d95926',
    pie3: '#199e70',
    pie4: '#c98500',
    pie5: '#d55181',
    pie6: '#008300',
    pie7: '#9085e9',
    pie8: '#e66767',
    cScale0: '#3987e5',
    cScaleLabel0: '#0f1419',
    cScale1: '#d95926',
    cScaleLabel1: '#0f1419',
    cScale2: '#199e70',
    cScaleLabel2: '#0f1419',
    cScale3: '#c98500',
    cScaleLabel3: '#0f1419',
    cScale4: '#d55181',
    cScaleLabel4: '#0f1419',
    cScale5: '#008300',
    cScaleLabel5: '#ffffff',
    cScale6: '#9085e9',
    cScaleLabel6: '#0f1419',
    cScale7: '#e66767',
    cScaleLabel7: '#0f1419',
    git0: '#3987e5',
    gitBranchLabel0: '#0f1419',
    git1: '#d95926',
    gitBranchLabel1: '#0f1419',
    git2: '#199e70',
    gitBranchLabel2: '#0f1419',
    git3: '#c98500',
    gitBranchLabel3: '#0f1419',
    git4: '#d55181',
    gitBranchLabel4: '#0f1419',
    git5: '#008300',
    gitBranchLabel5: '#ffffff',
    git6: '#9085e9',
    gitBranchLabel6: '#0f1419',
    git7: '#e66767',
    gitBranchLabel7: '#0f1419',
  },
  light: {
    darkMode: false,
    fontFamily: FONT,
    background: '#ffffff',
    mainBkg: '#e9f7f1',
    primaryColor: '#e9f7f1',
    primaryBorderColor: '#0b8f6e',
    primaryTextColor: '#0f1a22',
    secondaryColor: '#eef2f5',
    secondaryBorderColor: '#9aabb7',
    tertiaryColor: '#f6f8fa',
    tertiaryBorderColor: '#c6d1d9',
    lineColor: '#566672',
    textColor: '#0f1a22',
    noteBkgColor: '#dcf5ec',
    noteTextColor: '#0f1a22',
    noteBorderColor: '#0b8f6e',
    clusterBkg: '#f6f8fa',
    clusterBorder: '#c6d1d9',
    edgeLabelBackground: '#ffffff',
    actorBkg: '#e9f7f1',
    actorBorder: '#0b8f6e',
    actorTextColor: '#0f1a22',
    signalColor: '#0f1a22',
    signalTextColor: '#0f1a22',
    pieStrokeColor: '#ffffff',
    pieStrokeWidth: '2px',
    pieOpacity: '1',
    pieOuterStrokeColor: '#ffffff',
    pieSectionTextColor: '#0f1419',
    pieTitleTextColor: '#0f1a22',
    pieLegendTextColor: '#0f1a22',
    // Categorical series (validated, fixed order): pie slices, mindmap/timeline/journey sections, git branches.
    pie1: '#2a78d6',
    pie2: '#eb6834',
    pie3: '#1baf7a',
    pie4: '#eda100',
    pie5: '#e87ba4',
    pie6: '#008300',
    pie7: '#6250d6',
    pie8: '#e34948',
    cScale0: '#2a78d6',
    cScaleLabel0: '#ffffff',
    cScale1: '#eb6834',
    cScaleLabel1: '#0f1419',
    cScale2: '#1baf7a',
    cScaleLabel2: '#0f1419',
    cScale3: '#eda100',
    cScaleLabel3: '#0f1419',
    cScale4: '#e87ba4',
    cScaleLabel4: '#0f1419',
    cScale5: '#008300',
    cScaleLabel5: '#ffffff',
    cScale6: '#6250d6',
    cScaleLabel6: '#ffffff',
    cScale7: '#e34948',
    cScaleLabel7: '#0f1419',
    git0: '#2a78d6',
    gitBranchLabel0: '#ffffff',
    git1: '#eb6834',
    gitBranchLabel1: '#0f1419',
    git2: '#1baf7a',
    gitBranchLabel2: '#0f1419',
    git3: '#eda100',
    gitBranchLabel3: '#0f1419',
    git4: '#e87ba4',
    gitBranchLabel4: '#0f1419',
    git5: '#008300',
    gitBranchLabel5: '#ffffff',
    git6: '#6250d6',
    gitBranchLabel6: '#ffffff',
    git7: '#e34948',
    gitBranchLabel7: '#0f1419',
  },
}

// xychart reads its series colors from a nested config, in the same order.
const XY_PALETTE: Record<Theme, string> = {
  dark: '#3987e5,#d95926,#199e70,#c98500,#d55181,#008300,#9085e9,#e66767',
  light: '#2a78d6,#eb6834,#1baf7a,#eda100,#e87ba4,#008300,#6250d6,#e34948',
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
      theme: 'base',
      themeVariables: { ...DIAGRAM_THEMES[theme], xyChart: { plotColorPalette: XY_PALETTE[theme] } },
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
const PNG_BACKGROUND: Record<Theme, string> = { light: '#ffffff', dark: '#161f27' }

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
