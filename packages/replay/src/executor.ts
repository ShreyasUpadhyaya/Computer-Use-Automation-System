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
export async function executeSteps(
  options: ReplayOptions,
): Promise<{ stepsExecuted: number } | { failedAt: { step: Step; index: number; error: Error } }> {
  const { artifact, params, page, allowlist } = options;

  const validation = validateParams(artifact.inputSchema, params);
  if (!validation.valid) {
    throw new Error(`Invalid params for artifact "${artifact.id}": ${validation.errors.join('; ')}`);
  }

  await page.goto(`${artifact.targetApp.baseUrl}${artifact.targetApp.entryPath}`);

  for (let index = 0; index < artifact.steps.length; index++) {
    const step = artifact.steps[index]!;
    options.onStepStarted?.(step, index);

    try {
      await executeStep(page, step, params, allowlist);
    } catch (error) {
      return { failedAt: { step, index, error: error instanceof Error ? error : new Error(String(error)) } };
    }
  }

  return { stepsExecuted: artifact.steps.length };
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
