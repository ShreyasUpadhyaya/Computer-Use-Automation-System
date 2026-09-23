import type { Page } from 'playwright';
import { resolveLocator, LocatorResolutionError, type Checkpoint } from '@cua/core';

export type CheckpointResult = { satisfied: true } | { satisfied: false; reason: string };

/**
 * Verifies a Checkpoint against the live page (assignment glossary:
 * "a condition you assert to confirm you actually reached the state you
 * expected, rather than assuming the click worked"). Run once, after all
 * steps execute — this is what turns "the last action didn't throw" into
 * "we actually reached the state the artifact claims to reach."
 */
export async function verifyCheckpoint(page: Page, checkpoint: Checkpoint): Promise<CheckpointResult> {
  switch (checkpoint.type) {
    case 'urlMatches': {
      const pattern = new RegExp(checkpoint.pattern);
      const url = page.url();
      return pattern.test(url)
        ? { satisfied: true }
        : { satisfied: false, reason: `URL "${url}" does not match pattern "${checkpoint.pattern}"` };
    }
    case 'elementVisible': {
      try {
        await resolveLocator(page, checkpoint.locator, 3000);
        return { satisfied: true };
      } catch (error) {
        const detail = error instanceof LocatorResolutionError ? error.message : String(error);
        return { satisfied: false, reason: `Expected element not visible: ${detail}` };
      }
    }
    case 'textPresent': {
      try {
        const resolved = await resolveLocator(page, checkpoint.locator, 3000);
        const text = (await resolved.playwrightLocator.textContent())?.trim() ?? '';
        return text.includes(checkpoint.expectedText)
          ? { satisfied: true }
          : { satisfied: false, reason: `Expected text "${checkpoint.expectedText}", found "${text}"` };
      } catch (error) {
        const detail = error instanceof LocatorResolutionError ? error.message : String(error);
        return { satisfied: false, reason: `Could not read checkpoint element: ${detail}` };
      }
    }
  }
}
