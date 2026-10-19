import { useEffect } from 'react'
import { setAnalyticsContext } from '../analytics.ts'
import type { DocType } from '../share/docType.ts'

/** Tags every analytics event with the type of the document this page shows, while it is mounted. */
export function useDocType(type: DocType): void {
  useEffect(() => {
    setAnalyticsContext({ doc_type: type })
    return () => setAnalyticsContext({ doc_type: undefined })
  }, [type])
}
