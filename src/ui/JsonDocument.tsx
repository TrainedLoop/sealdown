import { lazy, Suspense, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { track } from '../analytics.ts'
import { useCommands } from './commands.ts'
import { useDocumentTitle } from './docTitle.ts'
import { downloadBlob } from './download.ts'
import { ExportMenu } from './ExportMenu.tsx'
import { HeaderSlot } from './headerSlots.tsx'
import { Lock } from './icons.tsx'
import { loadJsonDraft, saveJsonDraft } from './jsonDraft.ts'
import { useDocType } from './useDocType.ts'

const JsonEditor = lazy(() => import('../json/JsonEditor.tsx'))

function parses(text: string): boolean {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

/** A shared JSON document: read-only tree (text when it doesn't parse), export and Edit a copy. */
export function JsonDocument({ text, sealed }: { text: string; sealed: boolean }) {
  const { t } = useTranslation()
  const valid = useMemo(() => parses(text), [text])
  useDocumentTitle(null)
  useDocType('json')

  function editCopy() {
    const draft = loadJsonDraft()
    if (draft.trim() !== '' && draft.trim() !== '{}' && draft !== text && !window.confirm(t('json.replaceDraft'))) return
    saveJsonDraft(text)
    window.location.hash = '#/json'
  }

  const downloadJson = () => {
    track('export', { format: 'json' })
    downloadBlob(new Blob([text], { type: 'application/json' }), 'document.json')
  }

  useCommands('reader', [
    { id: 'edit-copy', label: t('reader.editCopy'), run: editCopy },
    { id: 'export-json', label: t('export.json'), run: downloadJson },
  ])

  return (
    <div className="json-reader">
      <HeaderSlot name="actions">
        <ExportMenu items={[{ id: 'json', label: t('export.json'), run: downloadJson }]} />
        <button type="button" className="primary reader-edit" onClick={editCopy}>
          {t('reader.editCopy')}
        </button>
      </HeaderSlot>
      {sealed && (
        <p className="unsealed-badge">
          <Lock />
          {t('reader.unsealed')}
        </p>
      )}
      <div className="json-reader-view">
        <Suspense fallback={<p className="status">{t('json.loading')}</p>}>
          <JsonEditor text={text} mode={valid ? 'tree' : 'text'} readOnly label={t('json.viewerLabel')} />
        </Suspense>
      </div>
    </div>
  )
}
