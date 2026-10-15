import { diagramTypes, sanitizeEvent } from '../../src/analytics.ts'

test('strips query and fragment from every URL property', () => {
  const event = sanitizeEvent({
    properties: {
      $current_url: 'https://trainedloop.github.io/sealdown/#/s/Ab3dE5gH9k.secretkey',
      $referrer: 'https://chat.example/x?token=1#frag',
      $initial_current_url: 'https://trainedloop.github.io/sealdown/?embed#/v/payload',
      custom: 'http://localhost:4173/#/v/abc',
      route: 'inline',
      count: 3,
    },
  })
  expect(event.properties).toEqual({
    $current_url: 'https://trainedloop.github.io/sealdown/',
    $referrer: 'https://chat.example/x',
    $initial_current_url: 'https://trainedloop.github.io/sealdown/',
    custom: 'http://localhost:4173/',
    route: 'inline',
    count: 3,
  })
})

test('sanitizes nested $set properties too', () => {
  const event = sanitizeEvent({
    properties: {},
    $set: { $current_url: 'https://a.example/p#/v/x' },
    $set_once: { $initial_referrer: 'https://b.example/?q=1' },
  })
  expect(event.$set).toEqual({ $current_url: 'https://a.example/p' })
  expect(event.$set_once).toEqual({ $initial_referrer: 'https://b.example/' })
})

test('lists the first keyword of each mermaid block', () => {
  const text = '```mermaid\ngraph TD; A-->B\n```\n\ntext\n\n```mermaid\n  sequenceDiagram\n  A->>B: hi\n```\n```ts\nx\n```'
  expect(diagramTypes(text)).toEqual(['graph', 'sequenceDiagram'])
})

test('only known diagram keywords are reported; anything else is "other"', () => {
  const text = '```mermaid\nProjectFalcon --> Legal\n```\n```mermaid\nflowchart LR\n```\n```mermaid\nzenuml\n```\n```mermaid\nstateDiagram-v2\n```'
  expect(diagramTypes(text)).toEqual(['other', 'flowchart', 'zenuml', 'stateDiagram-v2'])
})
