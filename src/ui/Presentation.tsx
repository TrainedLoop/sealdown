import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { MarkdownView } from './MarkdownView.tsx'
import type { Theme } from './theme.ts'

const SWIPE_PX = 50

/** Full-viewport slides split at `---`. Arrows, Space, Page Up/Down, Home/End and swipes navigate; Esc closes. */
export function Presentation({ slides, theme, onClose }: { slides: string[]; theme: Theme; onClose: () => void }) {
  const { t } = useTranslation()
  const [index, setIndex] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const swipeStart = useRef<number | null>(null)
  const last = slides.length - 1
  const go = (next: number) => setIndex(Math.max(0, Math.min(last, next)))

  useEffect(() => {
    const element = root.current
    element?.focus()
    // Fullscreen is a nicety; browsers may refuse it (iframes, some mobiles).
    element?.requestFullscreen?.().catch(() => undefined)
    return () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
      else if (['ArrowRight', ' ', 'PageDown'].includes(event.key)) setIndex((i) => Math.min(last, i + 1))
      else if (['ArrowLeft', 'PageUp'].includes(event.key)) setIndex((i) => Math.max(0, i - 1))
      else if (event.key === 'Home') setIndex(0)
      else if (event.key === 'End') setIndex(last)
      else return
      event.preventDefault()
    }
    // Leaving fullscreen with the browser's own Esc also ends the presentation.
    function onFullscreenChange() {
      if (!document.fullscreenElement) onClose()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
    }
  }, [last, onClose])

  function onPointerUp(event: PointerEvent) {
    if (swipeStart.current === null) return
    const dx = event.clientX - swipeStart.current
    swipeStart.current = null
    if (dx <= -SWIPE_PX) go(index + 1)
    else if (dx >= SWIPE_PX) go(index - 1)
  }

  return (
    <div
      ref={root}
      className="presentation"
      role="dialog"
      aria-modal="true"
      aria-label={t('present.dialog')}
      tabIndex={-1}
      onPointerDown={(e) => (swipeStart.current = e.clientX)}
      onPointerUp={onPointerUp}
    >
      <div className="slide">
        <MarkdownView key={index} html={slides[index]} theme={theme} />
      </div>
      <div className="presentation-bar">
        <button type="button" aria-label={t('present.previous')} disabled={index === 0} onClick={() => go(index - 1)}>
          ←
        </button>
        <span className="slide-counter">
          {index + 1} / {slides.length}
        </span>
        <button type="button" aria-label={t('present.next')} disabled={index === last} onClick={() => go(index + 1)}>
          →
        </button>
        <button type="button" onClick={onClose}>
          {t('present.close')}
        </button>
      </div>
    </div>
  )
}
