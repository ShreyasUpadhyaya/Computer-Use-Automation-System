import type { Page } from 'playwright';

/**
 * The perception given to the LLM (and, at replay time, to the Playwright
 * driver's own locator resolution) each step: a role/name-based
 * accessibility digest plus a screenshot.
 *
 * We deliberately do NOT hand the LLM raw HTML/DOM. The accessibility tree
 * (role + accessible name) is the one representation that stays meaningful
 * across a modern web app, a legacy server-rendered app with table layouts
 * and no test IDs, and — per the assignment's design-for-heterogeneity ask —
 * a native desktop app, since accessibility trees exist there too. Grounding
 * every action in role+name from the start is what makes the recorded
 * artifact's locators (packages/core's Locator type) robust rather than
 * brittle CSS/XPath.
 */
export interface Perception {
  url: string;
  title: string;
  /** YAML-ish accessibility tree digest, from Playwright's ariaSnapshot(). */
  accessibilityTree: string;
  screenshotPath: string;
}

export async function perceive(page: Page, screenshotDir: string, stepIndex: number): Promise<Perception> {
  const accessibilityTree = await page.locator('body').ariaSnapshot();
  const screenshotPath = `${screenshotDir}/step-${String(stepIndex).padStart(2, '0')}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });

  return {
    url: page.url(),
    title: await page.title(),
    accessibilityTree,
    screenshotPath,
  };
}
