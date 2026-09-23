import type { Page } from 'playwright';
import type { BusinessOutcomeCode } from '@cua/core';

/**
 * Business-outcome detection (Section 3.3 / glossary: "Business outcome vs.
 * failure — 'no such member' is a legitimate answer the caller needs, not a
 * crash. Conflating the two is the most common design mistake here.").
 *
 * Run whenever a step fails or the checkpoint misses, BEFORE giving up and
 * reporting a generic hard failure. Each detector inspects page content for
 * a signature specific to a known, named outcome the target app itself
 * produces — the same signatures a human operator would recognize on sight.
 * This list is necessarily app-specific (a different target surface would
 * need its own signatures), which is exactly why it lives as a small,
 * explicit table rather than a generic heuristic: a reviewer can see
 * exactly what triggers each classification.
 *
 * Detection is content-based (page text), not just HTTP status, because
 * many real back-office apps render an error state as HTTP 200 with an
 * in-page message rather than a non-2xx response — status is checked where
 * available as a secondary confirming signal.
 */
interface OutcomeSignature {
  code: BusinessOutcomeCode;
  /** Text that, if present anywhere on the page, confirms this outcome. */
  textSignatures: string[];
}

const KNOWN_OUTCOMES: OutcomeSignature[] = [
  { code: 'NOT_FOUND', textSignatures: ['Record not found', 'No member found matching ID'] },
  { code: 'PERMISSION_DENIED', textSignatures: ['RESTRICTED', 'Account actions are blocked'] },
  { code: 'VALIDATION_ERROR', textSignatures: ['must be a positive number', 'Account type is invalid'] },
  { code: 'SESSION_EXPIRED', textSignatures: ['session has expired'] },
];

export interface DetectedOutcome {
  code: BusinessOutcomeCode;
  detail: string;
}

/**
 * Reads the page's visible text and checks it against every known outcome
 * signature, returning the first match. Returns undefined when nothing
 * matches — meaning this really is an unanticipated hard failure, not a
 * business outcome we simply failed to recognize.
 */
export async function detectBusinessOutcome(page: Page): Promise<DetectedOutcome | undefined> {
  const bodyText = await page.locator('body').innerText().catch(() => '');

  for (const outcome of KNOWN_OUTCOMES) {
    const matchedSignature = outcome.textSignatures.find((signature) => bodyText.includes(signature));
    if (matchedSignature) {
      return { code: outcome.code, detail: `Detected "${matchedSignature}" on page` };
    }
  }

  return undefined;
}
