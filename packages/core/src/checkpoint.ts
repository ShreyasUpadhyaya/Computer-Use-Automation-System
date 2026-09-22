import type { Locator } from './locator.js';

/**
 * A condition asserted after the last step to confirm the run actually
 * reached the expected end state, rather than assuming the last action
 * "worked" just because it didn't throw. See assignment glossary:
 * "Checkpoint — a condition you assert to confirm you actually reached the
 * state you expected, rather than assuming the click worked."
 */
export type Checkpoint =
  | { type: 'elementVisible'; locator: Locator }
  | { type: 'urlMatches'; pattern: string }
  | { type: 'textPresent'; locator: Locator; expectedText: string };
