function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Parse the model's structured output as either one JSON value or JSONL
 * object fragments. Multiple JSONL object records are merged in order so a
 * passage delivered field-by-field has the same shape as a normal response.
 */
export function parseJsonOrJsonl(value: string): unknown {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:jsonl|json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced?.[1]?.trim() || trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    let records: unknown[];
    try {
      records = candidate
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as unknown);
    } catch {
      throw new Error("Structured output is neither JSON nor object-based JSONL.");
    }
    if (records.length === 1) return records[0];
    if (records.length > 1 && records.every((record) => isRecord(record))) {
      return Object.assign({}, ...records);
    }
    throw new Error("Structured output is neither JSON nor object-based JSONL.");
  }
}
