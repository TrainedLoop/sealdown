import { mermaidHint } from '../../../src/render/mermaidHints.ts'

test('a semicolon inside a sequence message', () => {
  const source = 'sequenceDiagram\n  participant F\n  F->>F: draft ("4 changes"; group = "on save")\n  F->>B: ok'
  expect(mermaidHint(source)).toEqual({ line: 3, kind: 'semicolon' })
})

test('escaped semicolons are fine', () => {
  expect(mermaidHint('sequenceDiagram\n  A->>B: one#59; two')).toBeNull()
})

test('semicolons in notes count too', () => {
  expect(mermaidHint('sequenceDiagram\n  Note over A,B: first; second')).toEqual({ line: 2, kind: 'semicolon' })
})

test('braces inside a state transition label', () => {
  const source = 'stateDiagram-v2\n  [*] --> Draft\n  Draft --> Compared: compare {discard_other_setup: true}'
  expect(mermaidHint(source)).toEqual({ line: 3, kind: 'braces' })
})

test('a real composite state is not flagged', () => {
  expect(mermaidHint('stateDiagram-v2\n  state Busy {\n    [*] --> Working\n  }')).toBeNull()
})

test('other diagram types are left alone', () => {
  expect(mermaidHint('flowchart LR\n  A["a; b {c}"] --> B')).toBeNull()
})
