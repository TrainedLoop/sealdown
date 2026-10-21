import { buildHash, parseRoute } from '../../../src/router/route.ts'

test('empty and root hashes are the editor', () => {
  for (const h of ['', '#', '#/']) expect(parseRoute(h)).toEqual({ kind: 'editor' })
})

test('inline route', () => {
  expect(parseRoute('#/v/abc-_09')).toEqual({ kind: 'inline', payload: 'abc-_09' })
})

test('stored route', () => {
  expect(parseRoute('#/s/Ab3dE5gH9k.key-_X')).toEqual({ kind: 'stored', id: 'Ab3dE5gH9k', key: 'key-_X' })
})

test('unknown prefix', () => {
  expect(parseRoute('#/x/whatever')).toEqual({ kind: 'unknown-format' })
})

test('malformed', () => {
  for (const h of ['#/v/', '#/s/', '#/s/onlyid', '#/s/bad id.key', '#/v/a+b', '#/v/%E0%A4%A']) {
    expect(parseRoute(h)).toEqual({ kind: 'malformed' })
  }
})

test('strips trailing junk added by chat apps', () => {
  expect(parseRoute('#/v/abc.')).toEqual({ kind: 'inline', payload: 'abc' })
  expect(parseRoute('#/v/abc)')).toEqual({ kind: 'inline', payload: 'abc' })
  expect(parseRoute('#/s/Ab3dE5gH9k.key,  ')).toEqual({ kind: 'stored', id: 'Ab3dE5gH9k', key: 'key' })
  expect(parseRoute('#%2Fv%2Fabc')).toEqual({ kind: 'inline', payload: 'abc' })
})

test('buildHash round-trips', () => {
  const stored = { kind: 'stored', id: 'Ab3dE5gH9k', key: 'k' } as const
  const inline = { kind: 'inline', payload: 'abc' } as const
  expect(parseRoute(buildHash(stored))).toEqual(stored)
  expect(parseRoute(buildHash(inline))).toEqual(inline)
  expect(buildHash({ kind: 'editor' })).toBe('#/')
})

test('strips angle brackets, ellipses and invisible characters glued to links', () => {
  expect(parseRoute('#/v/abc>')).toEqual({ kind: 'inline', payload: 'abc' })
  expect(parseRoute('#/v/abc…')).toEqual({ kind: 'inline', payload: 'abc' })
  expect(parseRoute('#/v/abc​')).toEqual({ kind: 'inline', payload: 'abc' })
  expect(parseRoute('#/v/abc﻿')).toEqual({ kind: 'inline', payload: 'abc' })
})

test('password-protected routes', () => {
  expect(parseRoute('#/p/abc-_09')).toEqual({ kind: 'inline-protected', payload: 'abc-_09' })
  expect(parseRoute('#/q/Ab3dE5gH9k')).toEqual({ kind: 'stored-protected', id: 'Ab3dE5gH9k' })
  expect(parseRoute('#/q/Ab3dE5gH9k.')).toEqual({ kind: 'stored-protected', id: 'Ab3dE5gH9k' })
  for (const h of ['#/p/', '#/q/short', '#/q/Ab3dE5gH9k.key']) expect(parseRoute(h)).toEqual({ kind: 'malformed' })
  for (const r of [
    { kind: 'inline-protected', payload: 'abc' },
    { kind: 'stored-protected', id: 'Ab3dE5gH9k' },
  ] as const) {
    expect(parseRoute(buildHash(r))).toEqual(r)
  }
})

test('sealed inline route carries payload and key', () => {
  expect(parseRoute('#/e/abc-_09.key-_X')).toEqual({ kind: 'inline-sealed', payload: 'abc-_09', key: 'key-_X' })
  expect(parseRoute('#/e/abc.key.')).toEqual({ kind: 'inline-sealed', payload: 'abc', key: 'key' })
  for (const h of ['#/e/', '#/e/abc', '#/e/abc.', '#/e/.key', '#/e/a+b.key']) expect(parseRoute(h)).toEqual({ kind: 'malformed' })
  const r = { kind: 'inline-sealed', payload: 'abc', key: 'k' } as const
  expect(parseRoute(buildHash(r))).toEqual(r)
})

test('json editor route', () => {
  for (const h of ['#/json', '#/json/', '#/json.']) expect(parseRoute(h)).toEqual({ kind: 'json-editor' })
  expect(parseRoute('#/jsonx')).toEqual({ kind: 'unknown-format' })
  expect(buildHash({ kind: 'json-editor' })).toBe('#/json')
})

const KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const TOKEN = 'B' + 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'.slice(1)

test('live routes', () => {
  expect(parseRoute(`#/l/Ab3dE5gH9k.${KEY}`)).toEqual({ kind: 'live-read', id: 'Ab3dE5gH9k', key: KEY })
  expect(parseRoute(`#/w/Ab3dE5gH9k.${KEY}.${TOKEN}.`)).toEqual({ kind: 'live-edit', id: 'Ab3dE5gH9k', key: KEY, token: TOKEN })
  for (const h of ['#/l/short.' + KEY, '#/l/Ab3dE5gH9k', '#/w/Ab3dE5gH9k.' + KEY, '#/w/Ab3dE5gH9k.' + KEY + '.bad token']) {
    expect(parseRoute(h)).toEqual({ kind: 'malformed' })
  }
  expect(buildHash({ kind: 'live-read', id: 'Ab3dE5gH9k', key: KEY })).toBe(`#/l/Ab3dE5gH9k.${KEY}`)
  expect(buildHash({ kind: 'live-edit', id: 'Ab3dE5gH9k', key: KEY, token: TOKEN })).toBe(`#/w/Ab3dE5gH9k.${KEY}.${TOKEN}`)
})

test('password-protected live routes carry no key', () => {
  expect(parseRoute('#/m/Ab3dE5gH9k')).toEqual({ kind: 'live-read-protected', id: 'Ab3dE5gH9k' })
  expect(parseRoute(`#/n/Ab3dE5gH9k.${TOKEN}`)).toEqual({ kind: 'live-edit-protected', id: 'Ab3dE5gH9k', token: TOKEN })
  for (const h of ['#/m/short', '#/m/Ab3dE5gH9k.extra', '#/n/Ab3dE5gH9k', '#/n/Ab3dE5gH9k.bad token']) {
    expect(parseRoute(h)).toEqual({ kind: 'malformed' })
  }
  expect(buildHash({ kind: 'live-read-protected', id: 'Ab3dE5gH9k' })).toBe('#/m/Ab3dE5gH9k')
  expect(buildHash({ kind: 'live-edit-protected', id: 'Ab3dE5gH9k', token: TOKEN })).toBe(`#/n/Ab3dE5gH9k.${TOKEN}`)
})
