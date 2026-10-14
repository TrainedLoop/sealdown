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
