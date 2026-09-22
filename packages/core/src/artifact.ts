import type { Checkpoint } from './checkpoint.js';
import type { ParamSchema } from './param-schema.js';
import type { Step } from './step.js';

/**
 * A CapabilityArtifact is the reusable, agent-invocable unit this whole
 * system exists to produce: a typed, versioned contract that captures what
 * an LLM discovered once, so that a production caller (another AI agent, or
 * a scheduler) can invoke it many times without any model in the loop.
 *
 * Deliberately decoupled from the raw discovery transcript — `discovery`
 * below is provenance metadata (which run produced this, when), not the
 * transcript itself. The transcript lives separately as run evidence
 * (see packages/agent's run logger), because a capability's contract should
 * stay stable even if we later choose to discard or rotate old transcripts.
 */
export interface CapabilityArtifact {
  id: string;
  /** Monotonically increasing per `id`; replay always records which version it ran. */
  version: number;
  name: string;
  description: string;

  targetApp: {
    baseUrl: string;
    entryPath: string;
    /** Free-form tag for the underlying vendor product/surface, e.g. "mock-core-banking-v1". Used for multi-tenant matching — see REPORT.md. */
    surfaceId: string;
  };

  inputSchema: ParamSchema;
  outputSchema: ParamSchema;

  steps: Step[];
  checkpoint: Checkpoint;

  /** Action classification driving guardrail enforcement at replay time; see packages/guardrails. */
  riskLevel: 'safe' | 'risky';

  discovery: {
    runId: string;
    recordedAt: string;
    model: string;
  };
}

export function nextVersion(previous: CapabilityArtifact | undefined): number {
  return previous ? previous.version + 1 : 1;
}
