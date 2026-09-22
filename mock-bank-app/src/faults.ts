// Deliberate fault-injection triggers, keyed off specific input values rather
// than a side-channel header. This keeps every fault reachable purely by
// driving the UI with a particular input — exactly how the discovery agent
// and the replay engine will encounter it in practice — instead of requiring
// out-of-band test machinery.

export const SESSION_TIMEOUT_MEMBER_ID = '00000-TIMEOUT';
export const SLOW_LOAD_MEMBER_ID = '00000-SLOW';
export const APP_ERROR_DEPOSIT_TRIGGER = '999999.99';

export const SLOW_LOAD_DELAY_MS = 4000;
