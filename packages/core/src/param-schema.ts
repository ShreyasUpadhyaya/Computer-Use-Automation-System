/**
 * A deliberately small, hand-rolled subset of JSON Schema — just enough to
 * describe an artifact's typed inputs/outputs (the contract an AI agent
 * would read to know what to pass in and what it gets back) without pulling
 * in a full JSON Schema validator dependency for a handful of primitive
 * shapes. If this needed to grow (nested objects, enums with descriptions,
 * etc.) swapping in `ajv` + real JSON Schema would be a drop-in upgrade —
 * the ParamSchema shape below is a strict subset of it on purpose.
 */
export interface ParamField {
  type: 'string' | 'number' | 'boolean';
  description: string;
  required: boolean;
  /** Example value, shown to a human reviewer or a calling agent for guidance. */
  example?: string | number | boolean;
}

export type ParamSchema = Record<string, ParamField>;

export function validateParams(
  schema: ParamSchema,
  values: Record<string, unknown>,
): { valid: true } | { valid: false; errors: string[] } {
  const errors: string[] = [];

  for (const [name, field] of Object.entries(schema)) {
    const value = values[name];
    if (value === undefined || value === null) {
      if (field.required) errors.push(`Missing required param "${name}"`);
      continue;
    }
    if (typeof value !== field.type) {
      errors.push(`Param "${name}" expected ${field.type}, got ${typeof value}`);
    }
  }

  for (const name of Object.keys(values)) {
    if (!(name in schema)) errors.push(`Unexpected param "${name}" not declared in schema`);
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}
