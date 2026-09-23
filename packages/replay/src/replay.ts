import type { Page } from 'playwright';
import type { CapabilityArtifact, ReplayResult } from '@cua/core';
import type { AllowlistConfig } from '@cua/guardrails';
import { executeSteps, LocatorResolutionError } from './executor.js';
import { verifyCheckpoint } from './verify.js';
import { extractOutputs } from './extract-outputs.js';

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
 * Order matters: checkpoint verification happens BEFORE output extraction.
 * A checkpoint failure means we never reliably reached the state the
 * artifact promises, so trusting whatever text happens to be on screen at
 * that point would risk returning outputs that look plausible but weren't
 * actually confirmed — exactly the "assumed the click worked" mistake a
 * checkpoint exists to catch.
 *
 * Business-outcome classification (turning a specific failure into a named
 * BusinessOutcomeCode like NOT_FOUND) lands in the next commit; for now a
 * checkpoint miss or step failure is reported as a generic `failure`.
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

  const checkpointResult = await verifyCheckpoint(options.page, options.artifact.checkpoint);
  if (!checkpointResult.satisfied) {
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
