const MINUTE = 60_000
/** Checkpoints while people keep editing. */
export const ACTIVE_EVERY_MS = 5 * MINUTE
/** A checkpoint when editing stops for this long (the end of a session). */
export const QUIET_AFTER_MS = 2 * MINUTE

/**
 * Whether to add an automatic checkpoint now: only after edits since the last one, and either
 * every 5 minutes of activity or once editing has been quiet for 2 minutes.
 */
export function checkpointDue(now: number, lastEdit: number, lastCheckpoint: number, editedSince: boolean): boolean {
  if (!editedSince) return false
  return now - lastCheckpoint >= ACTIVE_EVERY_MS || now - lastEdit >= QUIET_AFTER_MS
}
