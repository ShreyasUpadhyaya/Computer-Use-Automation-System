import type { Locator } from './locator.js';

/** A value a Step needs, either a fixed literal recorded during discovery, or a reference to an input parameter supplied at replay/invocation time. */
export type StepValue = { kind: 'literal'; value: string } | { kind: 'param'; paramName: string };

export type StepAction =
  | { type: 'navigate'; url: StepValue }
  | { type: 'click'; locator: Locator }
  | { type: 'type'; locator: Locator; value: StepValue; clearFirst?: boolean }
  | { type: 'selectOption'; locator: Locator; value: StepValue }
  | { type: 'waitFor'; locator: Locator; timeoutMs: number }
  | {
      type: 'extract';
      locator: Locator;
      /** Name this extracted value is bound to in the artifact's outputs. */
      outputName: string;
      /** How to read the value out of the matched element. */
      attribute: 'text' | 'value';
    };

/**
 * What the replay engine should do if this specific step fails to find its
 * locator or times out. Distinct from the run-level result taxonomy in
 * result.ts — this is a per-step recovery policy, evaluated before the
 * failure is escalated to a run-level outcome.
 */
export type StepFailurePolicy =
  | { onFailure: 'retry'; maxAttempts: number; backoffMs: number }
  | { onFailure: 'escalate' }
  | { onFailure: 'fail' };

export interface Step {
  id: string;
  description: string;
  action: StepAction;
  failurePolicy: StepFailurePolicy;
}
