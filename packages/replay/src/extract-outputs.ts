import type { Page } from 'playwright';
import { resolveLocator, type CapabilityArtifact } from '@cua/core';

/**
 * Reads every `extract` step's target element and binds it to its declared
 * outputName, producing the typed outputs a caller receives on success.
 * Run after the checkpoint verifies, so extraction reads the final,
 * confirmed state rather than a possibly-transient intermediate page.
 */
export async function extractOutputs(
  page: Page,
  artifact: CapabilityArtifact,
): Promise<Record<string, unknown>> {
  const outputs: Record<string, unknown> = {};

  for (const step of artifact.steps) {
    if (step.action.type !== 'extract') continue;

    const resolved = await resolveLocator(page, step.action.locator);
    const value =
      step.action.attribute === 'value'
        ? await resolved.playwrightLocator.inputValue()
        : ((await resolved.playwrightLocator.textContent()) ?? '').trim();

    outputs[step.action.outputName] = value;
  }

  return outputs;
}
