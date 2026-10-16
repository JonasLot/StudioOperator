// Pure rules for slowing down passcode guessing: after MAX_FAILURES wrong attempts
// from one client, further attempts are refused until the window has passed.

export const MAX_FAILURES = 8;
export const WINDOW_MS = 15 * 60 * 1000;

export interface AttemptState {
  failures: number;
  windowStart: number; // ms since epoch
}

/** Milliseconds until another attempt is allowed; 0 when not blocked. */
export function blockedForMs(state: AttemptState | null, now: number): number {
  if (!state || state.failures < MAX_FAILURES) return 0;
  return Math.max(0, state.windowStart + WINDOW_MS - now);
}

export function afterFailure(state: AttemptState | null, now: number): AttemptState {
  if (!state || now - state.windowStart >= WINDOW_MS) return { failures: 1, windowStart: now };
  return { failures: state.failures + 1, windowStart: state.windowStart };
}
