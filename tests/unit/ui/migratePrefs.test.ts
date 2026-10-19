import { migratePrefs } from '../../../src/ui/migratePrefs.ts'

afterEach(() => localStorage.clear())

test('moves old keys to the new names and removes them', () => {
  localStorage.setItem('rendermd.draft', '# my draft')
  localStorage.setItem('rendermd.theme', 'light')
  migratePrefs()
  expect(localStorage.getItem('sealdown.draft')).toBe('# my draft')
  expect(localStorage.getItem('sealdown.theme')).toBe('light')
  expect(localStorage.getItem('rendermd.draft')).toBeNull()
  expect(localStorage.getItem('rendermd.theme')).toBeNull()
})

test('never overwrites a value already saved under the new name', () => {
  localStorage.setItem('rendermd.draft', 'old')
  localStorage.setItem('sealdown.draft', 'new')
  migratePrefs()
  expect(localStorage.getItem('sealdown.draft')).toBe('new')
  expect(localStorage.getItem('rendermd.draft')).toBeNull()
})

test('storage failures are ignored', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new DOMException('denied', 'SecurityError')
  })
  expect(() => migratePrefs()).not.toThrow()
  vi.restoreAllMocks()
})

test('a draft too big to exist twice still migrates', () => {
  localStorage.setItem('rendermd.draft', 'big draft')
  localStorage.setItem('rendermd.theme', 'light')
  const realSet = Storage.prototype.setItem
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
    // Simulate the quota: the new copy fits only once the old one is gone.
    if (key === 'sealdown.draft' && this.getItem('rendermd.draft') !== null) throw new DOMException('full', 'QuotaExceededError')
    realSet.call(this, key, value)
  })
  migratePrefs()
  vi.restoreAllMocks()
  expect(localStorage.getItem('sealdown.draft')).toBe('big draft')
  expect(localStorage.getItem('sealdown.theme')).toBe('light')
})
