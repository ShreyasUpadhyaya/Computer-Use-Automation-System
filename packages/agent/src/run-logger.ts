import fs from 'node:fs/promises';
import path from 'node:path';
import { redactValue } from '@cua/guardrails';
import type { StepLogEntry, DiscoveryLoopResult } from './loop.js';

/**
 * Evidence layout for one discovery run (Section 3.5):
 *
 *   <evidenceRoot>/<runId>/
 *     run.json           structured summary: goal, steps, stop reason, timings
 *     steps.jsonl         one redacted StepLogEntry per line, written as it happens
 *     screenshots/         one PNG per step (already produced by perception.ts)
 *
 * Writing steps.jsonl incrementally (not just a final run.json) means a run
 * that crashes or times out mid-way still leaves a debuggable trail — the
 * richer signal on failure Section 3.5 asks for isn't contingent on the run
 * finishing cleanly.
 *
 * redactValue() is applied to every entry before it touches disk, per
 * Section 3.4 ("never persist secrets or raw sensitive data... into
 * artifacts or logs"), since a step's typed text or extracted output could
 * in principle contain something sensitive.
 */
export class RunLogger {
  readonly runId: string;
  readonly runDir: string;
  readonly screenshotDir: string;
  private stepsFilePath: string;
  private startedAt: number;

  private constructor(runId: string, runDir: string) {
    this.runId = runId;
    this.runDir = runDir;
    this.screenshotDir = path.join(runDir, 'screenshots');
    this.stepsFilePath = path.join(runDir, 'steps.jsonl');
    this.startedAt = Date.now();
  }

  static async create(evidenceRoot: string, runIdPrefix = 'discovery'): Promise<RunLogger> {
    const runId = `${runIdPrefix}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const runDir = path.join(evidenceRoot, runId);
    const logger = new RunLogger(runId, runDir);
    await fs.mkdir(logger.screenshotDir, { recursive: true });
    return logger;
  }

  async logStep(entry: StepLogEntry): Promise<void> {
    const redacted = redactValue(entry);
    await fs.appendFile(this.stepsFilePath, JSON.stringify(redacted) + '\n', 'utf8');
  }

  async finalize(goal: string, model: string, result: DiscoveryLoopResult): Promise<void> {
    const summary = {
      runId: this.runId,
      goal,
      model,
      stopReason: result.stopReason,
      summary: result.summary,
      stepCount: result.steps.length,
      logEntryCount: result.log.length,
      startedAt: new Date(this.startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - this.startedAt,
    };
    await fs.writeFile(path.join(this.runDir, 'run.json'), JSON.stringify(redactValue(summary), null, 2), 'utf8');
  }
}
