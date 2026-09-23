import type { Page } from 'playwright';
import {
  resolveLocator,
  LocatorResolutionError,
  validateParams,
  type CapabilityArtifact,
  type Step,
  type StepValue,
  type ReplayResult,
} from '@cua/core';
import { checkOrigin, checkActionType, type AllowlistConfig } from '@cua/guardrails';

export interface ReplayOptions {
  artifact: CapabilityArtifact;
  params: Record<string, unknown>;
  page: Page;
  allowlist: AllowlistConfig;
  onStepStarted?: (step: Step, index: number) => void;
}

function resolveValue(value: StepValue, params: Record<string, unknown>): string {
  if (value.kind === 'literal') return value.value;
  const paramValue = params[value.paramName];
  if (paramValue === undefined) {
    throw new Error(`Missing value for parameter "${value.paramName}"`);
  }
  return String(paramValue);
}

/**
 * Executes a CapabilityArtifact's steps against a live Playwright page with
 * NO model in the loop (Section 3.3) — the production path an AI agent
 * would trigger. This module owns step execution and parameter
 * substitution; checkpoint verification and output extraction are layered
 * on in verify.ts, and business-outcome/hard-failure classification in
 * outcomes.ts, so each concern stays independently testable.
 *
 * Guardrails are re-checked here, not just trusted from discovery time:
 * an artifact is data on disk that could in principle be hand-edited, so
 * replay enforces the allowlist itself rather than assuming a step was
 * already safe because an agent recorded it.
 */
export interface StepFailure {
  step: Step;
  index: number;
  error: Error;
  /** Whether failurePolicy's retries were already exhausted before this was surfaced. */
  recoveryAttempted: boolean;
}

export async function executeSteps(
  options: ReplayOptions,
): Promise<{ stepsExecuted: number } | { failedAt: StepFailure }> {
  const { artifact, params, page, allowlist } = options;

  const validation = validateParams(artifact.inputSchema, params);
  if (!validation.valid) {
    throw new Error(`Invalid params for artifact "${artifact.id}": ${validation.errors.join('; ')}`);
  }

  await page.goto(`${artifact.targetApp.baseUrl}${artifact.targetApp.entryPath}`);

  for (let index = 0; index < artifact.steps.length; index++) {
    const step = artifact.steps[index]!;
    options.onStepStarted?.(step, index);

    const outcome = await executeStepWithRecovery(page, step, params, allowlist);
    if (outcome) {
      return { failedAt: { step, index, error: outcome.error, recoveryAttempted: outcome.recoveryAttempted } };
    }
  }

  return { stepsExecuted: artifact.steps.length };
}

/**
 * Applies the step's own failurePolicy before giving up: a `retry` policy
 * (the recoverable case — e.g. a transient slow load) gets a bounded number
 * of attempts with a fixed backoff; `escalate`/`fail` surface immediately.
 * This is intentionally a policy the *step* carries, decided at discovery
 * time, rather than a blanket retry-everything default — a step recorded
 * against a confirm/submit action should not be silently retried, since
 * retrying a partially-applied side effect is exactly the kind of thing
 * that must not happen unattended.
 */
async function executeStepWithRecovery(
  page: Page,
  step: Step,
  params: Record<string, unknown>,
  allowlist: AllowlistConfig,
): Promise<{ error: Error; recoveryAttempted: boolean } | undefined> {
  const policy = step.failurePolicy;
  const maxAttempts = policy.onFailure === 'retry' ? policy.maxAttempts : 1;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await executeStep(page, step, params, allowlist);
      return undefined;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (policy.onFailure === 'retry' && attempt < maxAttempts) {
        await page.waitForTimeout(policy.backoffMs);
      }
    }
  }

  return { error: lastError!, recoveryAttempted: policy.onFailure === 'retry' && maxAttempts > 1 };
}

async function executeStep(
  page: Page,
  step: Step,
  params: Record<string, unknown>,
  allowlist: AllowlistConfig,
): Promise<void> {
  const action = step.action;

  const actionTypeCheck = checkActionType(allowlist, action.type);
  if (!actionTypeCheck.allowed) {
    throw new Error(`Guardrail: ${actionTypeCheck.reason}`);
  }

  switch (action.type) {
    case 'navigate': {
      const url = resolveValue(action.url, params);
      const originCheck = checkOrigin(allowlist, url);
      if (!originCheck.allowed) throw new Error(`Guardrail: ${originCheck.reason}`);
      await page.goto(url);
      return;
    }
    case 'click': {
      const resolved = await resolveLocator(page, action.locator);
      await resolved.playwrightLocator.click();
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
      return;
    }
    case 'type': {
      const resolved = await resolveLocator(page, action.locator);
      const text = resolveValue(action.value, params);
      if (action.clearFirst) await resolved.playwrightLocator.fill('');
      await resolved.playwrightLocator.fill(text);
      return;
    }
    case 'selectOption': {
      const resolved = await resolveLocator(page, action.locator);
      const optionValue = resolveValue(action.value, params);
      await resolved.playwrightLocator.selectOption({ label: optionValue });
      return;
    }
    case 'waitFor': {
      await resolveLocator(page, action.locator, action.timeoutMs);
      return;
    }
    case 'extract': {
      // Extraction happens in verify.ts once all steps complete, so the
      // executor's job here is just to confirm the target is reachable.
      await resolveLocator(page, action.locator);
      return;
    }
  }
}

export { LocatorResolutionError };
export type { ReplayResult };
