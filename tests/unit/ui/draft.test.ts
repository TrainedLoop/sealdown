import { loadDraft, saveDraft } from '../../../src/ui/draft.ts'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

test('round trip', () => {
  saveDraft('# draft ✓')
  expect(loadDraft()).toBe('# draft ✓')
})

test('empty when nothing saved', () => {
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
  expect(loadDraft()).toBe('')
})
