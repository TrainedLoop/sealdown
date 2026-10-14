import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { track } from '../analytics.ts'

/** Longer links make QR codes too dense to scan reliably (and over ~2.9 KB, impossible). */
export const QR_MAX_LENGTH = 2000

export function QrCode({ url }: { url: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [image, setImage] = useState<string | null>(null)
  const tooLong = url.length > QR_MAX_LENGTH

  useEffect(() => {
    if (!open || tooLong) return
    let cancelled = false
    import('qrcode')
      .then(({ toDataURL }) => toDataURL(url, { margin: 1, width: 240, errorCorrectionLevel: 'M' }))
      .then((data) => !cancelled && setImage(data))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [open, tooLong, url])

  return (
    <div className="qr">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          if (!open) track('qr_shown')
          setOpen(!open)
        }}
      >
        {t('qr.button')}
      </button>
      {open && tooLong && <p className="status">{t('qr.tooLong')}</p>}
      {open && !tooLong && image && <img className="qr-image" src={image} alt={t('qr.alt')} width={240} height={240} />}
    </div>
  )
}
