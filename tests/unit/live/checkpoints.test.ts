import { checkpointDue } from '../../../src/live/checkpoints.ts'

const MIN = 60_000

test('a checkpoint after 5 minutes of activity, or after 2 quiet minutes, never without edits', () => {
  // now, last edit, last checkpoint, edited since
  expect(checkpointDue(10 * MIN, 9.9 * MIN, 5 * MIN, true)).toBe(true) // 5 min since the last one, still typing
  expect(checkpointDue(9 * MIN, 8.9 * MIN, 5 * MIN, true)).toBe(false) // 4 min, still typing
  expect(checkpointDue(9 * MIN, 7 * MIN, 5 * MIN, true)).toBe(true) // 2 min quiet
  expect(checkpointDue(9 * MIN, 7.5 * MIN, 5 * MIN, true)).toBe(false) // 1.5 min quiet
  expect(checkpointDue(60 * MIN, 1 * MIN, 0, false)).toBe(false) // nothing edited
})
