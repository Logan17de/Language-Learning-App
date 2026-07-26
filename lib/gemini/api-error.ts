type UnknownRecord = Record<string, unknown>;

export class GeminiApiError extends Error {
  readonly allowFallback: boolean;

  constructor(message: string, allowFallback: boolean) {
    super(message);
    this.name = "GeminiApiError";
    this.allowFallback = allowFallback;
  }
}

export interface GeminiApiDiagnostics {
  messages: string[];
  reasons: string[];
  fields: string[];
  descriptions: string[];
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function collectFacts(
  value: unknown,
  diagnostics: GeminiApiDiagnostics,
  depth = 0,
): void {
  if (depth > 8) return;
  if (Array.isArray(value)) {
    for (const item of value) collectFacts(item, diagnostics, depth + 1);
    return;
  }
  if (!isRecord(value)) return;

  if (typeof value.message === "string" && value.message.trim()) {
    diagnostics.messages.push(value.message.trim());
  }
  if (typeof value.reason === "string" && value.reason.trim()) {
    diagnostics.reasons.push(value.reason.trim());
  }
  if (typeof value.field === "string" && value.field.trim()) {
    diagnostics.fields.push(value.field.trim());
  }
  if (typeof value.description === "string" && value.description.trim()) {
    diagnostics.descriptions.push(value.description.trim());
  }
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") {
      collectFacts(child, diagnostics, depth + 1);
    }
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function getGeminiApiDiagnostics(payload: unknown): GeminiApiDiagnostics {
  const diagnostics: GeminiApiDiagnostics = {
    messages: [],
    reasons: [],
    fields: [],
    descriptions: [],
  };
  collectFacts(payload, diagnostics);
  return {
    messages: unique(diagnostics.messages),
    reasons: unique(diagnostics.reasons),
    fields: unique(diagnostics.fields),
    descriptions: unique(diagnostics.descriptions),
  };
}

export function createGeminiApiError(
  model: string,
  status: number,
  payload: unknown,
): GeminiApiError {
  const diagnostics = getGeminiApiDiagnostics(payload);
  const uniqueReasons = new Set(diagnostics.reasons);

  if (uniqueReasons.has("API_KEY_INVALID")) {
    return new GeminiApiError(
      "Gemini API key is invalid. Replace GEMINI_API_KEY in Vercel with an active key from Google AI Studio, then redeploy.",
      false,
    );
  }
  if (
    uniqueReasons.has("API_KEY_SERVICE_BLOCKED")
    || uniqueReasons.has("API_KEY_HTTP_REFERRER_BLOCKED")
    || uniqueReasons.has("API_KEY_IP_ADDRESS_BLOCKED")
  ) {
    return new GeminiApiError(
      "Gemini API access is blocked by this key's restrictions. Allow the Generative Language API for the server-side key.",
      false,
    );
  }
  if (status === 401 || status === 403) {
    return new GeminiApiError(
      "Gemini authentication was rejected. Check the server-side API key and its Google Cloud API restrictions.",
      false,
    );
  }
  if (status === 400) {
    const location = diagnostics.fields[0] ? ` at ${diagnostics.fields[0]}` : "";
    const detail = diagnostics.descriptions[0] ?? diagnostics.messages[0];
    return new GeminiApiError(
      detail
        ? `Gemini rejected the structured request${location}: ${detail}`
        : `Gemini rejected the structured request${location} as invalid.`,
      false,
    );
  }

  const detail = diagnostics.messages[0] ?? `request failed with status ${status}`;
  return new GeminiApiError(
    `${model} ${detail}`,
    status === 404 || status === 408 || status === 409 || status === 429 || status >= 500,
  );
}
