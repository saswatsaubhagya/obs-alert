import type { Field } from './eventTypes';

export type Values = Record<string, string | number>;
export type ValidateResult = { ok: true; values: Values } | { ok: false; error: string };

export function validatePayload(fields: Field[], body: unknown): ValidateResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'body must be a JSON object' };
  }
  const raw = body as Record<string, unknown>;
  const values: Values = {};

  for (const f of fields) {
    const v = raw[f.name];
    const absent = v === undefined || v === null || (typeof v === 'string' && !v.trim());
    if (absent) {
      if (f.required) return { ok: false, error: `field "${f.name}" required` };
      continue;
    }
    if (f.type === 'number') {
      const num = typeof v === 'number' ? v : Number(String(v).trim());
      if (!Number.isFinite(num)) return { ok: false, error: `field "${f.name}" must be a number` };
      values[f.name] = num;
    } else {
      if (typeof v === 'object') return { ok: false, error: `field "${f.name}" must be a string` };
      values[f.name] = String(v).trim();
    }
  }
  return { ok: true, values }; // unknown keys dropped
}
