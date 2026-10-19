import { useCombobox } from 'downshift'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { track } from '../analytics.ts'
import { useAllCommands, type Command } from './commands.ts'
import { HeaderSlot } from './headerSlots.tsx'
import { Search } from './icons.tsx'

/** Ctrl/Cmd+K (or the search button) lists every action available on the current page. */
export function CommandPalette() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // Capture phase, so the editor never swallows the shortcut.
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        event.stopPropagation()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [])

  return (
    <>
      <HeaderSlot name="search">
        <button
          type="button"
          className="header-button icon-only"
          aria-label={t('palette.name')}
          title={`${t('palette.name')} (Ctrl+K)`}
          onClick={() => setOpen(true)}
        >
          <Search />
        </button>
      </HeaderSlot>
      {open && <Palette onClose={() => setOpen(false)} />}
    </>
  )
}

function Palette({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const commands = useAllCommands()
  const [query, setQuery] = useState('')
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const items = commands.filter((c) => words.every((w) => c.label.toLowerCase().includes(w)))

  const run = (command: Command) => {
    onClose()
    track('command_run', { command: command.id })
    command.run()
  }

  const { getInputProps, getMenuProps, getItemProps, getLabelProps, highlightedIndex } = useCombobox({
    items,
    isOpen: true,
    selectedItem: null,
    initialHighlightedIndex: 0,
    defaultHighlightedIndex: 0,
    itemToString: (item) => item?.label ?? '',
    // Downshift owns the input's value (controlling it too drops fast keystrokes); we only filter.
    onInputValueChange: ({ inputValue }) => setQuery(inputValue ?? ''),
    onSelectedItemChange: ({ selectedItem }) => {
      if (selectedItem) run(selectedItem)
    },
  })

  return (
    <div className="modal-backdrop palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label={t('palette.name')}>
        <label className="visually-hidden" {...getLabelProps()}>
          {t('palette.search')}
        </label>
        <input
          className="palette-input"
          placeholder={t('palette.search')}
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
        <ul className="palette-list" {...getMenuProps()}>
          {items.map((item, index) => (
            <li
              key={item.id}
              className={index === highlightedIndex ? 'palette-item highlighted' : 'palette-item'}
              {...getItemProps({ item, index })}
            >
              {item.label}
            </li>
          ))}
          {items.length === 0 && <li className="palette-empty">{t('palette.empty')}</li>}
        </ul>
      </div>
    </div>
  )
}
