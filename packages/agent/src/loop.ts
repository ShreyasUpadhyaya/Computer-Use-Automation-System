import type { Page } from 'playwright';
import type { Step, StepAction, Locator } from '@cua/core';
import { checkOrigin, checkActionType, type AllowlistConfig } from '@cua/guardrails';
import { GeminiAgentClient } from './gemini-client.js';
import { perceive } from './perception.js';
import { resolveLocator, LocatorResolutionError } from './driver.js';
import type { FunctionCall } from '@google/genai';

export interface DiscoveryLoopOptions {
  goal: string;
  startUrl: string;
  page: Page;
  geminiApiKey: string;
  geminiModel: string;
  allowlist: AllowlistConfig;
  screenshotDir: string;
  maxSteps?: number;
  timeoutMs?: number;
  onStepLogged?: (entry: StepLogEntry) => void;
}

export interface StepLogEntry {
  index: number;
  timestamp: string;
  functionCall: FunctionCall;
  reasoning?: string;
  outcome: 'executed' | 'blocked' | 'locator_failed';
  detail?: string;
  screenshotPath: string;
}

export type DiscoveryStopReason =
  | 'goal_success'
  | 'goal_stuck'
  | 'max_steps_exceeded'
  | 'timeout'
  | 'dead_end';

export interface DiscoveryLoopResult {
  stopReason: DiscoveryStopReason;
  summary: string;
  steps: Step[];
  log: StepLogEntry[];
}

function toLiteralLocator(role: string, name: string): Locator {
  return { primary: { strategy: 'role', role, value: name }, fallbacks: [{ strategy: 'text', value: name }] };
}

/**
 * The model's declared tool schemas mark these fields required, so a missing
 * one means the model returned a malformed call — worth failing loudly on
 * rather than silently proceeding with `undefined`.
 */
function requireArg(args: Record<string, string | undefined>, key: string, toolName: string): string {
  const value = args[key];
  if (value === undefined) {
    throw new Error(`Tool call "${toolName}" is missing required argument "${key}"`);
  }
  return value;
}

/**
 * The observe -> decide -> act loop (Section 3.1). Each iteration: perceive
 * the live page, ask Gemini for the next tool call, enforce guardrails
 * against it, execute it against Playwright, record both a human-readable
 * log entry and a structured core.Step (so a successful run can become a
 * CapabilityArtifact without re-deriving anything from the transcript), and
 * feed the outcome back to the model for the next turn.
 *
 * Repeated identical-locator failures count as consecutive failures toward
 * a "dead end" stop — this is what keeps a confused model from looping
 * forever against a page it cannot make progress on.
 */
export async function runDiscoveryLoop(options: DiscoveryLoopOptions): Promise<DiscoveryLoopResult> {
  const maxSteps = options.maxSteps ?? 15;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const startedAt = Date.now();

  const client = new GeminiAgentClient(options.geminiApiKey, options.geminiModel);
  await client.start(options.goal);
  await options.page.goto(options.startUrl);

  const steps: Step[] = [];
  const log: StepLogEntry[] = [];
  let previousToolResult: { functionName: string; result: Record<string, unknown> } | undefined;
  let consecutiveFailures = 0;

  for (let i = 0; i < maxSteps; i++) {
    if (Date.now() - startedAt > timeoutMs) {
      return { stopReason: 'timeout', summary: `Exceeded ${timeoutMs}ms budget`, steps, log };
    }

    const perception = await perceive(options.page, options.screenshotDir, i);
    const decision = await client.decideNextAction(perception, previousToolResult);
    const call = decision.functionCall;
    const args = (call.args ?? {}) as Record<string, string | undefined>;

    if (call.name === 'finish') {
      const summary = args.summary ?? '(no summary provided)';
      const entry: StepLogEntry = {
        index: i,
        timestamp: new Date().toISOString(),
        functionCall: call,
        reasoning: summary,
        outcome: 'executed',
        screenshotPath: perception.screenshotPath,
      };
      log.push(entry);
      options.onStepLogged?.(entry);
      return {
        stopReason: args.outcome === 'success' ? 'goal_success' : 'goal_stuck',
        summary,
        steps,
        log,
      };
    }

    if (!call.name) {
      throw new Error('Model returned a function call with no name');
    }

    const actionTypeCheck = checkActionType(options.allowlist, call.name);
    const urlToCheck = call.name === 'navigate' ? requireArg(args, 'url', call.name) : options.page.url();
    const originCheck = checkOrigin(options.allowlist, urlToCheck);

    if (!actionTypeCheck.allowed || !originCheck.allowed) {
      const reason = !actionTypeCheck.allowed ? actionTypeCheck.reason : (originCheck as { reason: string }).reason;
      const entry: StepLogEntry = {
        index: i,
        timestamp: new Date().toISOString(),
        functionCall: call,
        reasoning: args.reasoning,
        outcome: 'blocked',
        detail: reason,
        screenshotPath: perception.screenshotPath,
      };
      log.push(entry);
      options.onStepLogged?.(entry);
      return { stopReason: 'dead_end', summary: `Guardrail blocked action: ${reason}`, steps, log };
    }

    try {
      const { step, resultForModel } = await executeToolCall(options.page, call.name, args);
      steps.push(step);
      consecutiveFailures = 0;

      const entry: StepLogEntry = {
        index: i,
        timestamp: new Date().toISOString(),
        functionCall: call,
        reasoning: args.reasoning,
        outcome: 'executed',
        screenshotPath: perception.screenshotPath,
      };
      log.push(entry);
      options.onStepLogged?.(entry);
      previousToolResult = { functionName: call.name, result: resultForModel };
    } catch (error) {
      consecutiveFailures += 1;
      const detail = error instanceof LocatorResolutionError ? error.message : String(error);
      const entry: StepLogEntry = {
        index: i,
        timestamp: new Date().toISOString(),
        functionCall: call,
        reasoning: args.reasoning,
        outcome: 'locator_failed',
        detail,
        screenshotPath: perception.screenshotPath,
      };
      log.push(entry);
      options.onStepLogged?.(entry);

      if (consecutiveFailures >= 2) {
        return { stopReason: 'dead_end', summary: `Two consecutive locator failures: ${detail}`, steps, log };
      }
      previousToolResult = { functionName: call.name, result: { error: detail } };
    }
  }

  return { stopReason: 'max_steps_exceeded', summary: `Exceeded ${maxSteps} steps without finishing`, steps, log };
}

async function executeToolCall(
  page: Page,
  name: string,
  args: Record<string, string | undefined>,
): Promise<{ step: Step; resultForModel: Record<string, unknown> }> {
  const id = `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const req = (key: string) => requireArg(args, key, name);

  switch (name) {
    case 'navigate': {
      const url = req('url');
      await page.goto(url);
      const action: StepAction = { type: 'navigate', url: { kind: 'literal', value: url } };
      return {
        step: { id, description: `Navigate to ${url}`, action, failurePolicy: { onFailure: 'fail' } },
        resultForModel: { ok: true, url: page.url() },
      };
    }
    case 'click': {
      const role = req('role');
      const elementName = req('name');
      const locator = toLiteralLocator(role, elementName);
      const resolved = await resolveLocator(page, locator);
      await resolved.playwrightLocator.click();
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
      const action: StepAction = { type: 'click', locator };
      return {
        step: {
          id,
          description: `Click ${role} "${elementName}"`,
          action,
          failurePolicy: { onFailure: 'retry', maxAttempts: 2, backoffMs: 500 },
        },
        resultForModel: { ok: true, url: page.url() },
      };
    }
    case 'type': {
      const role = req('role');
      const elementName = req('name');
      const text = req('text');
      const locator = toLiteralLocator(role, elementName);
      const resolved = await resolveLocator(page, locator);
      await resolved.playwrightLocator.fill(text);
      const action: StepAction = {
        type: 'type',
        locator,
        value: { kind: 'literal', value: text },
        clearFirst: true,
      };
      return {
        step: {
          id,
          description: `Type "${text}" into ${role} "${elementName}"`,
          action,
          failurePolicy: { onFailure: 'retry', maxAttempts: 2, backoffMs: 500 },
        },
        resultForModel: { ok: true },
      };
    }
    case 'selectOption': {
      const role = req('role');
      const elementName = req('name');
      const optionValue = req('optionValue');
      const locator = toLiteralLocator(role, elementName);
      const resolved = await resolveLocator(page, locator);
      await resolved.playwrightLocator.selectOption({ label: optionValue });
      const action: StepAction = {
        type: 'selectOption',
        locator,
        value: { kind: 'literal', value: optionValue },
      };
      return {
        step: {
          id,
          description: `Select "${optionValue}" in ${role} "${elementName}"`,
          action,
          failurePolicy: { onFailure: 'retry', maxAttempts: 2, backoffMs: 500 },
        },
        resultForModel: { ok: true },
      };
    }
    case 'extract': {
      const role = req('role');
      const elementName = req('name');
      const outputName = req('outputName');
      const locator = toLiteralLocator(role, elementName);
      const resolved = await resolveLocator(page, locator);
      const text = (await resolved.playwrightLocator.textContent())?.trim() ?? '';
      const action: StepAction = { type: 'extract', locator, outputName, attribute: 'text' };
      return {
        step: {
          id,
          description: `Extract text of ${role} "${elementName}" as "${outputName}"`,
          action,
          failurePolicy: { onFailure: 'fail' },
        },
        resultForModel: { ok: true, extracted: text },
      };
    }
    default:
      throw new Error(`Unknown tool call: ${name}`);
  }
}
