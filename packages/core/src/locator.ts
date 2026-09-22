/**
 * How a Step identifies the element/control it acts on.
 *
 * Strategies are ordered by robustness: `role` (accessibility role + accessible
 * name) survives markup/CSS changes and works even with no clean DOM, which is
 * the primary case this system is designed for. `text` is a step down (matches
 * visible text, more sensitive to copy changes). `testId` is most robust when
 * available but legacy enterprise apps essentially never have test IDs (see
 * assignment glossary). `css` is the last-resort fallback, most brittle.
 */
export type LocatorStrategy = 'role' | 'text' | 'testId' | 'css';

export interface LocatorCandidate {
  strategy: LocatorStrategy;
  /** ARIA role, e.g. "button", "textbox", "link". Required when strategy === 'role'. */
  role?: string;
  /** Accessible name / visible text / test id value, depending on strategy. */
  value: string;
  /** Optional index to disambiguate multiple matches (0-based), used only as a last resort. */
  nth?: number;
}

/**
 * A locator is a primary candidate plus an explicit fallback chain, tried in
 * order at replay time. Recording every attempt (which candidate matched, if
 * any) is what lets a human reviewer judge how robust a recorded capability
 * really is, rather than trusting a single brittle selector.
 */
export interface Locator {
  primary: LocatorCandidate;
  fallbacks: LocatorCandidate[];
}
