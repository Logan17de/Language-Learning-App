import "server-only";

import {
  generateStructured as generateOpenAIStructured,
} from "@/lib/openai/structured-output";
import type {
  JsonSchema,
  StructuredGeneration,
} from "@/lib/openai/structured-output";

export type { JsonSchema, StructuredGeneration };

interface StructuredInput<T> {
  name: string;
  prompt: string;
  schema: JsonSchema;
  validate: (value: unknown) => string[];
  model?: string;
}

interface MissingWordRequest extends Record<string, unknown> {
  requestIndex: number;
  surface: string;
}

interface MissingWordResult extends Record<string, unknown> {
  requestIndex: number;
  terms: unknown[];
}

interface MissingWordPayload {
  results: MissingWordResult[];
}

interface ParsedMissingWordPrompt {
  prefix: string;
  requests: MissingWordRequest[];
  existingKanji: Set<string>;
}

const MISSING_WORD_NAME = "missing-word library enrichment";
const REQUESTS_MARKER = "Missing word requests: ";
const EXISTING_KANJI_MARKER = "Kanji already present in the library: ";
const AUXILIARY_ONLY_SURFACES = new Set([
  "です",
  "でした",
  "だ",
  "だった",
  "ます",
  "ました",
  "ません",
  "ませんでした",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  maximum: number,
): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function normalizeSurface(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, "");
}

function isAuxiliaryOnlyRequest(request: MissingWordRequest): boolean {
  return AUXILIARY_ONLY_SURFACES.has(normalizeSurface(request.surface));
}

function parseJsonLine(
  prompt: string,
  marker: string,
): unknown {
  const markerIndex = prompt.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = markerIndex + marker.length;
  const lineEnd = prompt.indexOf("\n", start);
  const json = prompt.slice(start, lineEnd < 0 ? prompt.length : lineEnd).trim();
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function parseMissingWordPrompt(prompt: string): ParsedMissingWordPrompt | null {
  const markerIndex = prompt.lastIndexOf(REQUESTS_MARKER);
  if (markerIndex < 0) return null;
  const requestText = prompt.slice(markerIndex + REQUESTS_MARKER.length).trim();
  let rawRequests: unknown;
  try {
    rawRequests = JSON.parse(requestText);
  } catch {
    return null;
  }
  if (!Array.isArray(rawRequests)) return null;

  const requests: MissingWordRequest[] = [];
  for (const candidate of rawRequests) {
    if (
      !isRecord(candidate) ||
      !Number.isInteger(candidate.requestIndex) ||
      typeof candidate.surface !== "string"
    ) {
      return null;
    }
    requests.push(candidate as MissingWordRequest);
  }

  const existing = parseJsonLine(prompt, EXISTING_KANJI_MARKER);
  const existingKanji = new Set(
    Array.isArray(existing)
      ? existing.filter((item): item is string => typeof item === "string")
      : [],
  );
  return {
    prefix: prompt.slice(0, markerIndex + REQUESTS_MARKER.length),
    requests,
    existingKanji,
  };
}

function requiredKanjiDetails(
  request: MissingWordRequest,
  existingKanji: Set<string>,
): string[] {
  return [...new Set(request.surface.match(/\p{Script=Han}/gu) ?? [])]
    .filter((character) => !existingKanji.has(character));
}

function requestForPrompt(
  request: MissingWordRequest,
  existingKanji: Set<string>,
): MissingWordRequest {
  return {
    ...request,
    requiredKanjiDetails: requiredKanjiDetails(request, existingKanji),
  };
}

function batchPrompt(
  parsed: ParsedMissingWordPrompt,
  requests: MissingWordRequest[],
): string {
  return `${parsed.prefix}${JSON.stringify(
    requests.map((request) => requestForPrompt(request, parsed.existingKanji)),
  )}`;
}

function cloneBatchSchema(schema: JsonSchema, count: number): JsonSchema {
  const cloned = JSON.parse(JSON.stringify(schema)) as JsonSchema;
  if (!isRecord(cloned.properties)) return cloned;
  const results = cloned.properties.results;
  if (!isRecord(results)) return cloned;
  results.minItems = count;
  results.maxItems = count;
  return cloned;
}

function batchShapeIssues(
  value: unknown,
  expectedRequests: MissingWordRequest[],
): string[] {
  if (!isRecord(value) || !Array.isArray(value.results)) {
    return ["Regional enrichment must contain results."];
  }
  const expected = new Set(expectedRequests.map((request) => request.requestIndex));
  const seen = new Set<number>();
  const issues: string[] = [];
  if (value.results.length !== expected.size) {
    issues.push(`Regional enrichment requires ${expected.size} results.`);
  }
  for (const candidate of value.results) {
    if (
      !isRecord(candidate) ||
      !Number.isInteger(candidate.requestIndex) ||
      !Array.isArray(candidate.terms)
    ) {
      issues.push("Every regional result needs requestIndex and terms.");
      continue;
    }
    const requestIndex = Number(candidate.requestIndex);
    if (!expected.has(requestIndex) || seen.has(requestIndex)) {
      issues.push(`Unexpected or duplicate regional requestIndex ${requestIndex}.`);
      continue;
    }
    seen.add(requestIndex);
  }
  for (const requestIndex of expected) {
    if (!seen.has(requestIndex)) {
      issues.push(`Regional requestIndex ${requestIndex} is missing.`);
    }
  }
  return issues;
}

function chunks<T>(items: T[], size: number): T[][] {
  const values: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    values.push(items.slice(index, index + size));
  }
  return values;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  run: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      async () => {
        while (true) {
          const index = nextIndex;
          nextIndex += 1;
          if (index >= items.length) return;
          results[index] = await run(items[index]!, index);
        }
      },
    ),
  );
  return results;
}

function payloadResults(value: unknown): MissingWordResult[] {
  if (!isRecord(value) || !Array.isArray(value.results)) return [];
  return value.results.filter(
    (candidate): candidate is MissingWordResult =>
      isRecord(candidate) &&
      Number.isInteger(candidate.requestIndex) &&
      Array.isArray(candidate.terms),
  );
}

function semanticIssues<T>(
  input: StructuredInput<T>,
  payload: MissingWordPayload,
  ignoredAuxiliaryIndices: Set<number>,
): string[] {
  return input.validate(payload).filter((issue) => {
    const match = issue.match(/^Request (\d+) needs at least one lexical term\.$/u);
    return !(
      match &&
      ignoredAuxiliaryIndices.has(Number(match[1]))
    );
  });
}

function failedRequestIndices(
  issues: string[],
  activeRequests: MissingWordRequest[],
): Set<number> {
  const active = new Set(activeRequests.map((request) => request.requestIndex));
  const failed = new Set<number>();
  for (const issue of issues) {
    for (const match of issue.matchAll(/Request (\d+)/gu)) {
      const requestIndex = Number(match[1]);
      if (active.has(requestIndex)) failed.add(requestIndex);
    }
  }
  if (failed.size === 0) {
    for (const requestIndex of active) failed.add(requestIndex);
  }
  return failed;
}

function relevantIssues(
  issues: string[],
  requests: MissingWordRequest[],
): string[] {
  const indices = new Set(requests.map((request) => request.requestIndex));
  return issues.filter((issue) => {
    const matches = [...issue.matchAll(/Request (\d+)/gu)];
    return matches.length === 0 || matches.some((match) => indices.has(Number(match[1])));
  });
}

function repairPrompt(
  parsed: ParsedMissingWordPrompt,
  requests: MissingWordRequest[],
  previous: MissingWordResult[],
  issues: string[],
): string {
  return [
    batchPrompt(parsed, requests),
    "",
    "Correct only these rejected missing-word regions. Approved regions are not included and must not be regenerated.",
    "Return one complete result for each supplied requestIndex and no explanation.",
    "Standalone particles and auxiliaries such as です, でした, ます, and ました are grammar, not permanent vocabulary records.",
    "For every character listed in requiredKanjiDetails, include exactly one complete kanjiDetails object. An empty kanjiDetails array is allowed only when requiredKanjiDetails is empty.",
    "Validation issues:",
    ...issues.map((issue) => `- ${issue}`),
    "Previous rejected JSON:",
    JSON.stringify({ results: previous }),
  ].join("\n");
}

async function generateRegionalMissingWords<T>(
  input: StructuredInput<T>,
  parsed: ParsedMissingWordPrompt,
): Promise<StructuredGeneration<T>> {
  const startedAt = Date.now();
  const batchSize = positiveInteger(
    process.env.OPENAI_ENRICHMENT_BATCH_SIZE,
    8,
    16,
  );
  const concurrency = positiveInteger(
    process.env.OPENAI_ENRICHMENT_CONCURRENCY,
    3,
    6,
  );
  const auxiliaryRequests = parsed.requests.filter(isAuxiliaryOnlyRequest);
  const activeRequests = parsed.requests.filter(
    (request) => !isAuxiliaryOnlyRequest(request),
  );
  const ignoredAuxiliaryIndices = new Set(
    auxiliaryRequests.map((request) => request.requestIndex),
  );
  const requestBatches = chunks(activeRequests, batchSize);

  const first = await mapWithConcurrency(
    requestBatches,
    concurrency,
    async (requests, index) => generateOpenAIStructured<MissingWordPayload>({
      name: `${input.name} batch ${index + 1}/${requestBatches.length}`,
      prompt: batchPrompt(parsed, requests),
      schema: cloneBatchSchema(input.schema, requests.length),
      validate: (value) => batchShapeIssues(value, requests),
      ...(input.model ? { model: input.model } : {}),
    }),
  );

  const auxiliaryResults: MissingWordResult[] = auxiliaryRequests.map(
    (request) => ({ requestIndex: request.requestIndex, terms: [] }),
  );
  const resultMap = new Map<number, MissingWordResult>();
  for (const result of auxiliaryResults) resultMap.set(result.requestIndex, result);
  for (const generation of first) {
    for (const result of payloadResults(generation.value)) {
      resultMap.set(result.requestIndex, result);
    }
  }

  const combined = (): MissingWordPayload => ({
    results: [...resultMap.values()].sort(
      (left, right) => left.requestIndex - right.requestIndex,
    ),
  });
  const initialIssues = semanticIssues(
    input,
    combined(),
    ignoredAuxiliaryIndices,
  );

  let repairGenerations: Array<StructuredGeneration<MissingWordPayload>> = [];
  if (initialIssues.length > 0) {
    const failedIndices = failedRequestIndices(initialIssues, activeRequests);
    const failedRequests = activeRequests.filter((request) =>
      failedIndices.has(request.requestIndex),
    );
    const repairBatches = chunks(failedRequests, Math.min(batchSize, 6));
    repairGenerations = await mapWithConcurrency(
      repairBatches,
      concurrency,
      async (requests, index) => {
        const previous = requests.flatMap((request) => {
          const result = resultMap.get(request.requestIndex);
          return result ? [result] : [];
        });
        return generateOpenAIStructured<MissingWordPayload>({
          name: `${input.name} item repair ${index + 1}/${repairBatches.length}`,
          prompt: repairPrompt(
            parsed,
            requests,
            previous,
            relevantIssues(initialIssues, requests),
          ),
          schema: cloneBatchSchema(input.schema, requests.length),
          validate: (value) => batchShapeIssues(value, requests),
          ...(input.model ? { model: input.model } : {}),
        });
      },
    );
    for (const generation of repairGenerations) {
      for (const result of payloadResults(generation.value)) {
        resultMap.set(result.requestIndex, result);
      }
    }
  }

  const finalPayload = combined();
  const finalIssues = semanticIssues(
    input,
    finalPayload,
    ignoredAuxiliaryIndices,
  );
  if (finalIssues.length > 0) {
    throw new Error(
      `${input.name} validation failed: ${finalIssues.join(" ")}`,
    );
  }

  const allGenerations = [...first, ...repairGenerations];
  const durationMs = Date.now() - startedAt;
  const repaired = initialIssues.length > 0 ||
    allGenerations.some((generation) => generation.repaired);
  const attempts = allGenerations.reduce(
    (total, generation) => total + generation.attempts,
    0,
  );
  const model = allGenerations[0]?.model ?? "local-auxiliary-filter";
  console.info("OpenAI regional missing-word enrichment completed.", {
    model,
    requestCount: parsed.requests.length,
    modelRequestCount: activeRequests.length,
    skippedAuxiliaryCount: auxiliaryRequests.length,
    initialBatchCount: requestBatches.length,
    repairedRegionCount: initialIssues.length > 0
      ? failedRequestIndices(initialIssues, activeRequests).size
      : 0,
    durationMs,
  });
  return {
    value: finalPayload as T,
    model,
    repaired,
    issues: initialIssues,
    durationMs,
    attempts,
  };
}

export async function generateStructured<T>(
  input: StructuredInput<T>,
): Promise<StructuredGeneration<T>> {
  if (input.name !== MISSING_WORD_NAME) {
    return generateOpenAIStructured(input);
  }
  const parsed = parseMissingWordPrompt(input.prompt);
  if (!parsed || parsed.requests.length < 2) {
    return generateOpenAIStructured(input);
  }
  return generateRegionalMissingWords(input, parsed);
}
