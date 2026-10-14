import { useCombobox } from 'downshift'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Theme } from '../ui/theme.ts'
import { diagramTemplates, type DiagramTemplate } from './templates.ts'

const templates = diagramTemplates()

function thumbnail(template: DiagramTemplate, theme: Theme): string {
  return `${import.meta.env.BASE_URL}diagram-thumbs/${template.slug}-${theme}.png`
}

/** Floating "Insert diagram" button that opens a searchable list of examples with thumbnails. */
export function DiagramPicker({ theme, onPick }: { theme: Theme; onPick: (template: DiagramTemplate) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  return (
    <div className="diagram-picker" ref={root}>
      <button type="button" className="diagram-picker-button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {t('editor.insertDiagram')}
      </button>
      {open && (
        <PickerPanel
          theme={theme}
          onClose={() => setOpen(false)}
          onPick={(template) => {
            setOpen(false)
            onPick(template)
          }}
        />
      )}
    </div>
  )
}

function PickerPanel({
  theme,
  onPick,
  onClose,
}: {
  theme: Theme
  onPick: (template: DiagramTemplate) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const items = templates.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()))

  const { getInputProps, getMenuProps, getItemProps, getLabelProps, highlightedIndex } = useCombobox({
    items,
    isOpen: true,
    selectedItem: null,
    inputValue: query,
    itemToString: (item) => item?.name ?? '',
    onInputValueChange: ({ inputValue, type }) => {
      if (type === useCombobox.stateChangeTypes.InputChange) setQuery(inputValue)
    },
    onSelectedItemChange: ({ selectedItem }) => {
      if (selectedItem) onPick(selectedItem)
    },
  })

  return (
    <div className="diagram-picker-panel">
      <label className="visually-hidden" {...getLabelProps()}>
        {t('editor.searchDiagrams')}
      </label>
      <input
        className="diagram-picker-search"
        placeholder={t('editor.searchDiagrams')}
        autoFocus
        {...getInputProps({
          onKeyDown: (event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              onClose()
            }
          },
        })}
      />
      <ul className="diagram-picker-list" {...getMenuProps()}>
        {items.map((item, index) => (
          <li
            key={item.slug}
            className={index === highlightedIndex ? 'diagram-option highlighted' : 'diagram-option'}
            {...getItemProps({ item, index })}
          >
            <img src={thumbnail(item, theme)} alt="" width={80} height={50} loading="lazy" decoding="async" />
            <span>{item.name}</span>
          </li>
        ))}
        {items.length === 0 && <li className="diagram-option-empty">{t('editor.noDiagrams')}</li>}
      </ul>
    </div>
  )
}
