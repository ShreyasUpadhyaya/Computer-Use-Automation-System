import type { Page } from 'playwright';
import type { CapabilityArtifact, ReplayResult } from '@cua/core';
import type { AllowlistConfig } from '@cua/guardrails';
import { executeSteps, LocatorResolutionError } from './executor.js';

export interface ReplayRunOptions {
  artifact: CapabilityArtifact;
  params: Record<string, unknown>;
  page: Page;
  allowlist: AllowlistConfig;
}

/**
 * The top-level entry point an AI agent would call in production
 * (Section 3.3): run the artifact, then report success / businessOutcome /
 * failure per the shared ReplayResult contract. Checkpoint verification and
 * typed output extraction land in a follow-up commit; for now a clean step
 * run is reported as success with empty outputs, which is enough to prove
 * the executor -> result-contract wiring end to end before layering on
 * verification.
 */
export async function replay(options: ReplayRunOptions): Promise<ReplayResult> {
  const execution = await executeSteps({
    artifact: options.artifact,
    params: options.params,
    page: options.page,
    allowlist: options.allowlist,
  });

  if ('failedAt' in execution) {
    const { step, index, error } = execution.failedAt;
    return {
      status: 'failure',
      stepId: step.id,
      stepIndex: index,
      expected: describeExpectation(error),
      observed: error.message,
      recoveryAttempted: false,
      stepsExecuted: index,
    };
  }

  return { status: 'success', outputs: {}, stepsExecuted: execution.stepsExecuted };
}

function describeExpectation(error: Error): string {
  if (error instanceof LocatorResolutionError) {
    return `Element matching locator to resolve: ${error.locator.primary.strategy}:"${error.locator.primary.value}"`;
  }
  return 'Step to complete without error';
}
