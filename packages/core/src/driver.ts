import type { Locator as PWLocator, Page } from 'playwright';
import type { Locator, LocatorCandidate } from './locator.js';

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Resolves a single LocatorCandidate to a Playwright Locator, without
 * checking visibility/actionability yet — that happens when the caller
 * awaits an action on it (click/fill/etc.), which is where Playwright's
 * auto-waiting does the real work.
 *
 * Lives in core (not agent or replay) because both the discovery loop and
 * the deterministic replay engine need identical locator-resolution
 * semantics against a live Playwright page — this is shared surface-
 * interaction infrastructure, not something specific to either side.
 */
export function resolveCandidate(page: Page, candidate: LocatorCandidate): PWLocator {
  let locator: PWLocator;
  switch (candidate.strategy) {
    case 'role':
      locator = page.getByRole(candidate.role as Parameters<Page['getByRole']>[0], { name: candidate.value });
      break;
    case 'text':
      locator = page.getByText(candidate.value, { exact: false });
      break;
    case 'testId':
      locator = page.getByTestId(candidate.value);
      break;
    case 'css':
      locator = page.locator(candidate.value);
      break;
  }
  return candidate.nth !== undefined ? locator.nth(candidate.nth) : locator;
}

export interface ResolveResult {
  playwrightLocator: PWLocator;
  matchedCandidate: LocatorCandidate;
  triedCandidates: LocatorCandidate[];
}

/**
 * Tries the primary candidate, then each fallback in order, returning the
 * first that resolves to exactly one visible element within the timeout.
 * This is the mechanism that makes replay resilient to small, expected
 * variation (e.g. a role+name match failing over to a text match) while
 * still failing loudly — via the thrown error listing every candidate tried
 * — when nothing in the chain works, rather than guessing further.
 */
export async function resolveLocator(
  page: Page,
  locator: Locator,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ResolveResult> {
  const candidates = [locator.primary, ...locator.fallbacks];
  const tried: LocatorCandidate[] = [];

  for (const candidate of candidates) {
    tried.push(candidate);
    const pwLocator = resolveCandidate(page, candidate);
    try {
      await pwLocator.waitFor({ state: 'visible', timeout: timeoutMs });
      const count = await pwLocator.count();
      if (count === 1) {
        return { playwrightLocator: pwLocator, matchedCandidate: candidate, triedCandidates: tried };
      }
    } catch {
      // fall through to next candidate
    }
  }

  throw new LocatorResolutionError(locator, tried);
}

export class LocatorResolutionError extends Error {
  constructor(
    public readonly locator: Locator,
    public readonly triedCandidates: LocatorCandidate[],
  ) {
    super(
      `Could not resolve locator: tried ${triedCandidates
        .map((c) => `${c.strategy}:"${c.value}"`)
        .join(' -> ')}`,
    );
    this.name = 'LocatorResolutionError';
  }
}
