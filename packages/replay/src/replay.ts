import type { Page } from 'playwright';
import type { CapabilityArtifact, ReplayResult } from '@cua/core';
import type { AllowlistConfig } from '@cua/guardrails';
import { executeSteps, LocatorResolutionError } from './executor.js';
import { verifyCheckpoint } from './verify.js';
import { extractOutputs } from './extract-outputs.js';
import { detectBusinessOutcome } from './outcomes.js';

export interface ReplayRunOptions {
  artifact: CapabilityArtifact;
  params: Record<string, unknown>;
  page: Page;
  allowlist: AllowlistConfig;
}

/**
 * The top-level entry point an AI agent would call in production
 * (Section 3.3): run the artifact's steps, verify the checkpoint, extract
 * declared outputs, and report success / businessOutcome / failure per the
 * shared ReplayResult contract.
 *
 * Error-taxonomy rule this function encodes: whenever automation cannot
 * proceed as expected — a step's locator never resolves, or the checkpoint
 * doesn't match — we ask "is this a KNOWN outcome the target app itself
 * produces?" before concluding it's an unanticipated hard failure.
 * detectBusinessOutcome() inspects the live page for the same signatures
 * (an on-page message, a status interstitial) a human operator would
 * recognize on sight. Only when nothing matches do we fall through to a
 * generic `failure` — the assignment's central taxonomy point: "no such
 * member" must never be conflated with a crash.
 *
 * Checkpoint verification happens BEFORE output extraction: a checkpoint
 * miss means we never reliably reached the promised end state, so trusting
 * whatever text happens to be on screen at that point would risk returning
 * outputs that look plausible but were never actually confirmed.
 */
export async function replay(options: ReplayRunOptions): Promise<ReplayResult> {
  const execution = await executeSteps({
    artifact: options.artifact,
    params: options.params,
    page: options.page,
    allowlist: options.allowlist,
  });

  if ('failedAt' in execution) {
    const { step, index, error, recoveryAttempted } = execution.failedAt;

    const outcome = await detectBusinessOutcome(options.page);
    if (outcome) {
      return { status: 'businessOutcome', code: outcome.code, detail: outcome.detail, stepsExecuted: index };
    }

    return {
      status: 'failure',
      stepId: step.id,
      stepIndex: index,
      expected: describeExpectation(error),
      observed: error.message,
      recoveryAttempted,
      stepsExecuted: index,
    };
  }

  const checkpointResult = await verifyCheckpoint(options.page, options.artifact.checkpoint);
  if (!checkpointResult.satisfied) {
    const outcome = await detectBusinessOutcome(options.page);
    if (outcome) {
      return {
        status: 'businessOutcome',
        code: outcome.code,
        detail: outcome.detail,
        stepsExecuted: execution.stepsExecuted,
      };
    }

    return {
      status: 'failure',
      stepId: '(checkpoint)',
      stepIndex: execution.stepsExecuted,
      expected: describeCheckpoint(options.artifact),
      observed: checkpointResult.reason,
      recoveryAttempted: false,
      stepsExecuted: execution.stepsExecuted,
    };
  }

  const outputs = await extractOutputs(options.page, options.artifact);
  return { status: 'success', outputs, stepsExecuted: execution.stepsExecuted };
}

function describeExpectation(error: Error): string {
  if (error instanceof LocatorResolutionError) {
    return `Element matching locator to resolve: ${error.locator.primary.strategy}:"${error.locator.primary.value}"`;
  }
  return 'Step to complete without error';
}

function describeCheckpoint(artifact: CapabilityArtifact): string {
  const checkpoint = artifact.checkpoint;
  switch (checkpoint.type) {
    case 'urlMatches':
      return `URL to match pattern "${checkpoint.pattern}"`;
    case 'elementVisible':
      return `Element visible: ${checkpoint.locator.primary.strategy}:"${checkpoint.locator.primary.value}"`;
    case 'textPresent':
      return `Text "${checkpoint.expectedText}" present in ${checkpoint.locator.primary.strategy}:"${checkpoint.locator.primary.value}"`;
  }
}
