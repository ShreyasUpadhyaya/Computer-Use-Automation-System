/**
 * Redaction for anything written to logs, artifacts, or evidence. Applied at
 * the boundary — right before a value is serialized to disk — rather than
 * relied upon deep in business logic, so it's one seam to audit.
 *
 * Patterns cover: SSNs, card numbers (13-19 digits, with optional
 * separators), common secret/token/API-key key-value pairs, and email
 * addresses (a light-touch PII catch-all for this demo; a production system
 * would extend this list per data-classification policy).
 */
const REDACTION_RULES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[REDACTED_SSN]' },
  { pattern: /\b(?:\d[ -]*?){13,19}\b/g, replacement: '[REDACTED_CARD]' },
  {
    pattern: /\b(api[_-]?key|token|secret|password|bearer)\b\s*[:=]\s*\S+/gi,
    replacement: '$1=[REDACTED]',
  },
  { pattern: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, replacement: '[REDACTED_EMAIL]' },
];

export function redactText(input: string): string {
  return REDACTION_RULES.reduce((text, rule) => text.replace(rule.pattern, rule.replacement), input);
}

/** Recursively redacts string values in an arbitrary JSON-serializable value, for logging structured objects. */
export function redactValue(value: unknown): unknown {
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactValue(v)]));
  }
  return value;
}
