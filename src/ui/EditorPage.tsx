import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createLink } from '../share/link.ts'
import { defaultStorage } from '../storage/storage.ts'
import { loadDraft, saveDraft } from './draft.ts'
import { ErrorMessage } from './ErrorMessage.tsx'
import { MarkdownView } from './MarkdownView.tsx'
import type { Theme } from './theme.ts'

type Tab = 'code' | 'preview'

type Shared =
  | { kind: 'link'; url: string; fallback: boolean; copied: boolean }
  | { kind: 'too-large' }

const DRAFT_DELAY_MS = 500

export function EditorPage({ theme }: { theme: Theme }) {
  const { t } = useTranslation()
  const [text, setText] = useState(loadDraft)
  const [tab, setTab] = useState<Tab>('code')
  const [shared, setShared] = useState<Shared | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => saveDraft(text), DRAFT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [text])

  function edit(next: string) {
    setText(next)
    setShared(null) // a link for the previous text would be misleading
  }

  async function generate() {
    setBusy(true)
    try {
      const result = await createLink(text, {
        storage: defaultStorage,
        baseUrl: window.location.origin + import.meta.env.BASE_URL,
      })
      if (result.kind === 'too-large') {
        setShared({ kind: 'too-large' })
        return
      }
      let copied = false
      try {
        await navigator.clipboard.writeText(result.url)
        copied = true
      } catch {
        // Clipboard blocked or unavailable: the link is still shown for manual copying.
      }
      setShared({ kind: 'link', url: result.url, fallback: result.kind === 'fallback', copied })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="editor">
      <div className="editor-toolbar">
        <div role="tablist" className="tabs">
          {(['code', 'preview'] as const).map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={tab === name}
              className={tab === name ? 'tab active' : 'tab'}
              onClick={() => setTab(name)}
            >
              {t(name === 'code' ? 'editor.code' : 'editor.preview')}
            </button>
          ))}
        </div>
        <button type="button" className="primary" disabled={busy || text.trim() === ''} onClick={generate}>
          {t(busy ? 'editor.generating' : 'editor.generate')}
        </button>
      </div>

      {shared?.kind === 'too-large' && <ErrorMessage kind="too-large" />}
      {shared?.kind === 'link' && (
        <div className="share-result">
          {shared.fallback && <ErrorMessage kind="storage-unavailable" />}
          <p role="status">{t(shared.copied ? 'editor.copied' : 'editor.copyManually')}</p>
          <input
            data-testid="share-url"
            aria-label={t('editor.shareUrl')}
            readOnly
            value={shared.url}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      )}

      {tab === 'code' ? (
        <textarea
          className="editor-input"
          aria-label={t('editor.placeholder')}
          placeholder={t('editor.placeholder')}
          spellCheck={false}
          value={text}
          onChange={(e) => edit(e.target.value)}
        />
      ) : text.trim() === '' ? (
        <p className="status">{t('editor.empty')}</p>
      ) : (
        <MarkdownView text={text} theme={theme} />
      )}
    </section>
  )
}
