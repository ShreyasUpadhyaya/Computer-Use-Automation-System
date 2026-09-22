/**
 * The replay result contract. This is the single most important taxonomy in
 * the system per the assignment brief: "Business outcome vs. failure —
 * 'no such member' is a legitimate answer the caller needs, not a crash.
 * Conflating the two is the most common design mistake here."
 *
 * Three cases, deliberately kept exhaustive and mutually exclusive:
 *
 * - `success`      — the capability completed and the checkpoint verified.
 *                     Declared outputs are returned to the caller.
 * - `businessOutcome` — the flow reached a *known*, named non-success state
 *                     that is itself a legitimate answer (not-found, denied,
 *                     validation error). The caller should branch on `code`,
 *                     not treat this as an error to retry or alert on.
 * - `failure`       — something the artifact did not anticipate: a locator
 *                     never resolved, an unexpected page, a timeout with no
 *                     matching recovery. This is what should page a human /
 *                     block unattended replay, with enough detail to debug.
 */
export type BusinessOutcomeCode =
  | 'NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'VALIDATION_ERROR'
  | 'SESSION_EXPIRED';

export type ReplayResult<TOutputs = Record<string, unknown>> =
  | {
      status: 'success';
      outputs: TOutputs;
      stepsExecuted: number;
    }
  | {
      status: 'businessOutcome';
      code: BusinessOutcomeCode;
      detail: string;
      stepsExecuted: number;
    }
  | {
      status: 'failure';
      /** Which step failed, by Step.id. */
      stepId: string;
      stepIndex: number;
      expected: string;
      observed: string;
      /** Whether this failure was already retried per the step's failurePolicy before being surfaced. */
      recoveryAttempted: boolean;
      stepsExecuted: number;
    };

/**
 * A condition detected mid-run that automation cannot safely resolve on its
 * own — raised by both the discovery agent loop and the replay engine, and
 * consumed by packages/escalation to pause and hand off the live session.
 */
export interface StuckSignal {
  reason: 'max_steps_exceeded' | 'timeout' | 'dead_end' | 'unrecoverable_error' | 'risky_action_blocked';
  detail: string;
  currentStepIndex: number;
  screenshotPath?: string;
}
