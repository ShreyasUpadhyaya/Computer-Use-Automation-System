export interface AllowlistConfig {
  /** Base URLs the agent/replay is permitted to navigate to at all. Exact origin match. */
  allowedOrigins: string[];
  /** Path prefixes permitted under an allowed origin, e.g. "/members", "/search". */
  allowedPathPrefixes: string[];
  /** Action types permitted to execute at all. Anything else is blocked outright. */
  allowedActionTypes: Array<'navigate' | 'click' | 'type' | 'selectOption' | 'waitFor' | 'extract'>;
}

export const defaultAllowlist: AllowlistConfig = {
  allowedOrigins: ['http://localhost:4000'],
  allowedPathPrefixes: ['/search', '/members'],
  allowedActionTypes: ['navigate', 'click', 'type', 'selectOption', 'waitFor', 'extract'],
};

export type PolicyDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

export function checkOrigin(config: AllowlistConfig, url: string): PolicyDecision {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: `"${url}" is not a valid URL` };
  }

  if (!config.allowedOrigins.includes(parsed.origin)) {
    return { allowed: false, reason: `Origin "${parsed.origin}" is not in the allowlist` };
  }

  const pathAllowed = config.allowedPathPrefixes.some((prefix) => parsed.pathname.startsWith(prefix));
  if (!pathAllowed) {
    return { allowed: false, reason: `Path "${parsed.pathname}" does not match any allowed prefix` };
  }

  return { allowed: true };
}

export function checkActionType(config: AllowlistConfig, actionType: string): PolicyDecision {
  if (!config.allowedActionTypes.includes(actionType as AllowlistConfig['allowedActionTypes'][number])) {
    return { allowed: false, reason: `Action type "${actionType}" is not in the allowlist` };
  }
  return { allowed: true };
}
