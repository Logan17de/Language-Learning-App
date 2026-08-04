export type OpenAIJsonSchema = Record<string, unknown>;

export type OpenAIReasoningEffort =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

const APPLICATION_VALIDATION_KEYWORDS = new Set([
  "$schema",
  "default",
  "examples",
  "format",
  "maxItems",
  "maxLength",
  "maximum",
  "minItems",
  "minLength",
  "minimum",
  "pattern",
]);

/**
 * Keep the structural portion of JSON Schema in the model request and leave
 * exact counts/ranges to AIko's existing deterministic validators. This avoids
 * provider-specific schema rejection without weakening application checks.
 */
export function simplifyOpenAIJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(simplifyOpenAIJsonSchema);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !APPLICATION_VALIDATION_KEYWORDS.has(key))
      .map(([key, child]) => [key, simplifyOpenAIJsonSchema(child)]),
  );
}

export function openAIResponseSchemaName(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 55);
  return `aiko_${normalized || "structured_output"}`.slice(0, 64);
}

export function openAIResponsesUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "");
  return normalized.endsWith("/responses")
    ? normalized
    : `${normalized}/responses`;
}

export function buildOpenAIResponsesRequest(input: {
  model: string;
  prompt: string;
  schema: OpenAIJsonSchema;
  schemaName: string;
  reasoningEffort: OpenAIReasoningEffort;
  strictSchema?: boolean;
  exactSchemaName?: boolean;
}): Record<string, unknown> {
  const strict = input.strictSchema === true;
  return {
    model: input.model,
    input: input.prompt,
    reasoning: {
      effort: input.reasoningEffort,
    },
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: input.exactSchemaName
          ? input.schemaName
          : openAIResponseSchemaName(input.schemaName),
        schema: strict ? input.schema : simplifyOpenAIJsonSchema(input.schema),
        // Existing provider-neutral schemas default to non-strict mode. Small,
        // fully required contracts can opt into the exact strict request used
        // by their tested API samples.
        strict,
      },
    },
    store: false,
  };
}
