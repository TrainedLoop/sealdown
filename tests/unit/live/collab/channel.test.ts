import { memoryHub } from '../../../../src/live/collab/channel.ts'
import type { Envelope } from '../../../../src/live/collab/crypto.ts'

const env = (s: string): Envelope => ({ t: 'sync1', s, d: 'AA==' })

test('a message reaches every other transport, never its sender', () => {
  const hub = memoryHub()
  const [a, b, c] = [hub.transport(), hub.transport(), hub.transport()]
  const got = { a: [] as string[], b: [] as string[], c: [] as string[] }
  a.onMessage((m) => got.a.push(m.s))
  b.onMessage((m) => got.b.push(m.s))
  c.onMessage((m) => got.c.push(m.s))
  a.send(env('a'))
  expect(got).toEqual({ a: [], b: ['a'], c: ['a'] })
})

test('status follows the hub; offline transports neither send nor receive', () => {
  const hub = memoryHub()
  const [a, b] = [hub.transport(), hub.transport()]
  const statuses: string[] = []
  a.onStatus((s) => statuses.push(s))
  const got: string[] = []
  b.onMessage((m) => got.push(m.s))
  hub.setOnline(a, false)
  a.send(env('lost'))
  hub.setOnline(a, true)
  a.send(env('kept'))
  expect(statuses).toEqual(['connected', 'offline', 'connected'])
  expect(got).toEqual(['kept'])
})

test('a closed transport stops receiving', () => {
  const hub = memoryHub()
  const [a, b] = [hub.transport(), hub.transport()]
  const got: string[] = []
  b.onMessage((m) => got.push(m.s))
  b.close()
  a.send(env('a'))
  expect(got).toEqual([])
})
