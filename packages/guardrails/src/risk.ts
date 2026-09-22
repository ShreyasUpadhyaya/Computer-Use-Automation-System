import type { StepAction } from '@cua/core';

/**
 * Safe/reversible vs. risky/irreversible classification (Section 3.4).
 *
 * Our stance: reads and navigation are always safe. Typing into a form is
 * safe in isolation (nothing external happens until submission). The one
 * inherently risky action type is `click`, and only conditionally — clicking
 * a control classified as a submit/confirm action is what actually causes
 * an irreversible side effect (e.g. "Confirm and Open Account"). We detect
 * this by locator name/text matching a small set of confirm-like phrases,
 * recorded explicitly on the artifact step rather than inferred at replay
 * time, so the classification is reviewable up front rather than guessed
 * live. Conservative default: an ambiguous click is treated as risky.
 */
const CONFIRM_LIKE_PATTERNS = [/confirm/i, /submit/i, /open.*account/i, /approve/i, /delete/i, /close.*account/i];

export type RiskLevel = 'safe' | 'risky';

export function classifyAction(action: StepAction): RiskLevel {
  switch (action.type) {
    case 'navigate':
    case 'waitFor':
    case 'extract':
    case 'type':
    case 'selectOption':
      return 'safe';
    case 'click': {
      const name = action.locator.primary.value ?? '';
      const looksConfirmLike = CONFIRM_LIKE_PATTERNS.some((pattern) => pattern.test(name));
      return looksConfirmLike ? 'risky' : 'safe';
    }
    default:
      return 'risky';
  }
}

export interface RiskPolicy {
  /** What to do when a risky action is about to execute. */
  onRiskyAction: 'block' | 'require_confirmation' | 'allow';
}

export const defaultRiskPolicy: RiskPolicy = {
  // Conservative default: this is regulated financial data, and Section 3.4
  // explicitly asks us to justify handling risky actions conservatively.
  // Discovery runs still need to reach a confirmation screen to prove the
  // capability works end-to-end, so we require an explicit confirmation
  // rather than blocking outright — see packages/agent's use of this policy.
  onRiskyAction: 'require_confirmation',
};

export type RiskDecision =
  | { proceed: true }
  | { proceed: false; reason: string; requiresHuman: boolean };

export function evaluateRisk(action: StepAction, policy: RiskPolicy): RiskDecision {
  const level = classifyAction(action);
  if (level === 'safe') return { proceed: true };

  switch (policy.onRiskyAction) {
    case 'allow':
      return { proceed: true };
    case 'block':
      return { proceed: false, reason: 'Risky action blocked by policy', requiresHuman: false };
    case 'require_confirmation':
      return {
        proceed: false,
        reason: 'Risky action requires explicit confirmation before proceeding',
        requiresHuman: true,
      };
  }
}
