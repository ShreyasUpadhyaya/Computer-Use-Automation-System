import type { CapabilityArtifact, Checkpoint, ParamSchema, Step, StepValue } from '@cua/core';
import { classifyAction, type RiskLevel } from '@cua/guardrails';

/**
 * Which literal value(s) recorded during discovery should become typed
 * input parameters on the artifact, rather than staying baked-in constants.
 * Kept as an explicit map the caller supplies (e.g. the CLI, after the
 * discovery run, or a config) rather than inferred automatically — guessing
 * "this string looks like an ID" is exactly the kind of heuristic that's
 * easy to get subtly wrong and hard to review; an explicit map is a design
 * decision a human reviewer can see and correct.
 */
export interface ParameterizationMap {
  /** Maps a literal value as it appeared in a Step (e.g. "12345") to a param name (e.g. "memberId"). */
  [literalValue: string]: { paramName: string; description: string; example?: string };
}

export interface RecordArtifactOptions {
  id: string;
  name: string;
  description: string;
  goal: string;
  targetApp: CapabilityArtifact['targetApp'];
  steps: Step[];
  parameterize: ParameterizationMap;
  outputSchema: ParamSchema;
  checkpoint: Checkpoint;
  discoveryRunId: string;
  model: string;
  previousVersion?: CapabilityArtifact;
}

function parameterizeValue(value: StepValue, map: ParameterizationMap): StepValue {
  if (value.kind !== 'literal') return value;
  const mapping = map[value.value];
  return mapping ? { kind: 'param', paramName: mapping.paramName } : value;
}

/** Rewrites every literal value in a Step's action that matches an entry in the parameterization map into a { kind: 'param' } reference. */
function parameterizeStep(step: Step, map: ParameterizationMap): Step {
  const action = step.action;
  switch (action.type) {
    case 'navigate':
      return { ...step, action: { ...action, url: parameterizeValue(action.url, map) } };
    case 'type':
      return { ...step, action: { ...action, value: parameterizeValue(action.value, map) } };
    case 'selectOption':
      return { ...step, action: { ...action, value: parameterizeValue(action.value, map) } };
    case 'click':
    case 'waitFor':
    case 'extract':
      return step;
  }
}

function deriveInputSchema(map: ParameterizationMap): ParamSchema {
  const schema: ParamSchema = {};
  for (const { paramName, description, example } of Object.values(map)) {
    schema[paramName] = { type: 'string', description, required: true, example };
  }
  return schema;
}

function deriveRiskLevel(steps: Step[]): RiskLevel {
  return steps.some((step) => classifyAction(step.action) === 'risky') ? 'risky' : 'safe';
}

/**
 * Turns a successful discovery run's Step[] into a CapabilityArtifact
 * (Section 3.2). This is a pure, deterministic transform over already-
 * structured Steps — not a re-interpretation of the raw model transcript —
 * which is exactly the decoupling Section 3.2 asks for: the artifact's
 * contract shouldn't change if we later change how we log or store
 * transcripts.
 */
export function recordArtifact(options: RecordArtifactOptions): CapabilityArtifact {
  const steps = options.steps.map((step) => parameterizeStep(step, options.parameterize));

  return {
    id: options.id,
    version: options.previousVersion ? options.previousVersion.version + 1 : 1,
    name: options.name,
    description: options.description,
    targetApp: options.targetApp,
    inputSchema: deriveInputSchema(options.parameterize),
    outputSchema: options.outputSchema,
    steps,
    checkpoint: options.checkpoint,
    riskLevel: deriveRiskLevel(steps),
    discovery: {
      runId: options.discoveryRunId,
      recordedAt: new Date().toISOString(),
      model: options.model,
    },
  };
}
