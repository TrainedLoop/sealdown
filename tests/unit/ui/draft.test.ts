import { isUntouched, loadDraft, saveDraft } from '../../../src/ui/draft.ts'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

test('round trip', () => {
  saveDraft('# draft ✓')
  expect(loadDraft()).toBe('# draft ✓')
})

test('a first visit gets the welcome sample, which counts as untouched', () => {
  const sample = loadDraft()
  expect(sample).toMatch(/^# Welcome to Sealdown/)
  expect(isUntouched(sample)).toBe(true)
  expect(isUntouched(sample + 'x')).toBe(false)
  expect(isUntouched('')).toBe(true)
  saveDraft('')
  expect(loadDraft()).toBe('')
})

test('storage failures are swallowed', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('quota', 'QuotaExceededError')
  })
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new DOMException('denied', 'SecurityError')
  })
  expect(() => saveDraft('x')).not.toThrow()
  expect(isUntouched(loadDraft())).toBe(true)
})
