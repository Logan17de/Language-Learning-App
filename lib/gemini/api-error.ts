type UnknownRecord = Record<string, unknown>;

export class GeminiApiError extends Error {
  readonly allowFallback: boolean;

  constructor(message: string, allowFallback: boolean) {
    super(message);
    this.name = "GeminiApiError";
    this.allowFallback = allowFallback;
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function collectFacts(
  value: unknown,
  messages: string[],
  reasons: string[],
  depth = 0,
): void {
  if (depth > 8) return;
  if (Array.isArray(value)) {
    for (const item of value) collectFacts(item, messages, reasons, depth + 1);
    return;
  }
  if (!isRecord(value)) return;

  if (typeof value.message === "string" && value.message.trim()) {
    messages.push(value.message.trim());
  }
  if (typeof value.reason === "string" && value.reason.trim()) {
    reasons.push(value.reason.trim());
  }
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") {
      collectFacts(child, messages, reasons, depth + 1);
    }
  }
}

export function createGeminiApiError(
  model: string,
  status: number,
  payload: unknown,
): GeminiApiError {
  const messages: string[] = [];
  const reasons: string[] = [];
  collectFacts(payload, messages, reasons);
  const uniqueReasons = new Set(reasons);

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
    return new GeminiApiError(
      messages[0]
        ? `Gemini rejected the structured request: ${messages[0]}`
        : "Gemini rejected the structured request as invalid.",
      false,
    );
  }

  const detail = messages[0] ?? `request failed with status ${status}`;
  return new GeminiApiError(
    `${model} ${detail}`,
    status === 404 || status === 408 || status === 409 || status === 429 || status >= 500,
  );
}
