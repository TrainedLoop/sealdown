import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { yCollab } from 'y-codemirror.next'
import { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'
import CodeEditor from '../../../src/editor/CodeEditor.tsx'

test('a collaborative editor starts from the shared text, even when the value given trails it', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const doc = new Y.Doc()
  const text = doc.getText('md')
  text.insert(0, 'arrived before the editor mounted')
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(<CodeEditor value="" onChange={() => undefined} label="Editor" collab={yCollab(text, new Awareness(doc))} />)
  })
  expect(host.querySelector('.cm-content')?.textContent).toBe('arrived before the editor mounted')
  await act(async () => root.unmount())
})
