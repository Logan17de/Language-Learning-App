type UnknownRecord = Record<string, unknown>;

export class OpenAIApiError extends Error {
  readonly allowFallback: boolean;
  readonly providerRequestId: string | null;

  constructor(message: string, allowFallback: boolean, providerRequestId: string | null = null) {
    super(message);
    this.name = "OpenAIApiError";
    this.allowFallback = allowFallback;
    this.providerRequestId = providerRequestId;
  }
}

export interface OpenAIApiDiagnostics {
  messages: string[];
  types: string[];
  codes: string[];
  params: string[];
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fact(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function collectFacts(
  value: unknown,
  diagnostics: OpenAIApiDiagnostics,
  depth = 0,
): void {
  if (depth > 8) return;
  if (Array.isArray(value)) {
    for (const item of value) collectFacts(item, diagnostics, depth + 1);
    return;
  }
  if (!isRecord(value)) return;

  const message = fact(value.message);
  const type = fact(value.type);
  const code = fact(value.code);
  const param = fact(value.param);
  if (message) diagnostics.messages.push(message);
  if (type) diagnostics.types.push(type);
  if (code) diagnostics.codes.push(code);
  if (param) diagnostics.params.push(param);

  for (const child of Object.values(value)) {
    if (child && typeof child === "object") {
      collectFacts(child, diagnostics, depth + 1);
    }
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function getOpenAIApiDiagnostics(payload: unknown): OpenAIApiDiagnostics {
  const diagnostics: OpenAIApiDiagnostics = {
    messages: [],
    types: [],
    codes: [],
    params: [],
  };
  collectFacts(payload, diagnostics);
  return {
    messages: unique(diagnostics.messages),
    types: unique(diagnostics.types),
    codes: unique(diagnostics.codes),
    params: unique(diagnostics.params),
  };
}

function includesAny(values: string[], candidates: string[]): boolean {
  const normalized = values.map((value) => value.toLowerCase());
  return candidates.some((candidate) =>
    normalized.some((value) => value.includes(candidate.toLowerCase())),
  );
}

export function createOpenAIApiError(
  model: string,
  status: number,
  payload: unknown,
  providerRequestId: string | null = null,
): OpenAIApiError {
  const diagnostics = getOpenAIApiDiagnostics(payload);
  const facts = [
    ...diagnostics.codes,
    ...diagnostics.types,
    ...diagnostics.messages,
  ];
  const detail = diagnostics.messages[0];

  if (
    status === 401 ||
    includesAny(facts, ["invalid_api_key", "incorrect api key"])
  ) {
    return new OpenAIApiError(
      "OpenAI authentication failed. Replace OPENAI_API_KEY in Vercel with an active server-side API key, then redeploy.",
      false,
      providerRequestId,
    );
  }

  if (status === 403) {
    return new OpenAIApiError(
      `OpenAI access to ${model} was denied. Confirm that this API project can use GPT-5.6 Luna and that the key has Responses API permission.`,
      false,
      providerRequestId,
    );
  }

  if (
    includesAny(facts, [
      "insufficient_quota",
      "billing_hard_limit_reached",
      "billing_not_active",
    ])
  ) {
    return new OpenAIApiError(
      "OpenAI API credits or billing are unavailable for this project. Add billing/credits before generating lessons.",
      false,
      providerRequestId,
    );
  }

  if (status === 404 || includesAny(facts, ["model_not_found"])) {
    return new OpenAIApiError(
      detail ?? `${model} is not available to this OpenAI API project.`,
      true,
      providerRequestId,
    );
  }

  if (status === 429) {
    return new OpenAIApiError(
      detail ?? `${model} is temporarily rate limited.`,
      true,
      providerRequestId,
    );
  }

  if (status === 400 || status === 422) {
    const location = diagnostics.params[0]
      ? ` at ${diagnostics.params[0]}`
      : "";
    return new OpenAIApiError(
      detail
        ? `OpenAI rejected the structured request${location}: ${detail}`
        : `OpenAI rejected the structured request${location} as invalid.`,
      false,
      providerRequestId,
    );
  }

  return new OpenAIApiError(
    detail ?? `${model} request failed with status ${status}.`,
    status === 408 || status === 409 || status >= 500,
    providerRequestId,
  );
}
