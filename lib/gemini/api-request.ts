export type GeminiJsonSchema = Record<string, unknown>;

const APPLICATION_VALIDATION_KEYWORDS = new Set([
  "additionalProperties",
  "maxItems",
  "maximum",
  "minItems",
  "minimum",
]);

export function simplifyGeminiJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(simplifyGeminiJsonSchema);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !APPLICATION_VALIDATION_KEYWORDS.has(key))
      .map(([key, child]) => [key, simplifyGeminiJsonSchema(child)]),
  );
}

export function generateContentUrl(baseUrl: string, model: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(model)}:generateContent`;
}

export function buildGenerateContentRequest(
  prompt: string,
  schema: GeminiJsonSchema,
): Record<string, unknown> {
  return {
    contents: [{
      role: "user",
      parts: [{ text: prompt }],
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: simplifyGeminiJsonSchema(schema),
    },
  };
}

export function buildInteractionsRequest(
  model: string,
  prompt: string,
  schema: GeminiJsonSchema,
): Record<string, unknown> {
  return {
    model,
    input: prompt,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: simplifyGeminiJsonSchema(schema),
    },
  };
}
