import "server-only";

import { OpenAIApiError } from "@/lib/openai/api-error";
import {
  generateStructured as generateStructuredWithOpenAI,
  type JsonSchema,
  type StructuredGeneration,
  type StructuredGenerationInput,
} from "@/lib/openai/structured-output";
import { saveGenerationTrace } from "@/lib/custom-lessons/generation-trace";

export type { JsonSchema, StructuredGeneration };

const DEFAULT_MAX_CONCURRENCY = 3;
const DEFAULT_TRANSIENT_RETRIES = 2;

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(Math.round(parsed), maximum));
}

const MAX_CONCURRENCY = boundedInteger(
  process.env.OPENAI_STRUCTURED_MAX_CONCURRENCY,
  DEFAULT_MAX_CONCURRENCY,
  1,
  8,
);
const TRANSIENT_RETRIES = boundedInteger(
  process.env.OPENAI_STRUCTURED_RETRIES,
  DEFAULT_TRANSIENT_RETRIES,
  0,
  4,
);

let activeCalls = 0;
const waitingCalls: Array<() => void> = [];

async function acquireCallSlot(): Promise<() => void> {
  if (activeCalls >= MAX_CONCURRENCY) {
    await new Promise<void>((resolve) => waitingCalls.push(resolve));
  }
  activeCalls += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeCalls = Math.max(0, activeCalls - 1);
    waitingCalls.shift()?.();
  };
}

function transientModelError(error: unknown): boolean {
  if (error instanceof OpenAIApiError) return error.allowFallback;
  if (!(error instanceof Error)) return false;
  const message = error.message.toLocaleLowerCase();
  return (
    error.name === "AbortError" ||
    error.name === "TimeoutError" ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("temporarily") ||
    message.includes("rate limit") ||
    message.includes("status 408") ||
    message.includes("status 409") ||
    /status 5\d\d/.test(message)
  );
}

function retryDelayMs(retryNumber: number): number {
  const exponential = 700 * 2 ** Math.max(0, retryNumber - 1);
  const jitter = Math.floor(Math.random() * 350);
  return Math.min(8_000, exponential + jitter);
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Every lesson generator and validator enters through this compatibility
 * boundary. It prevents one lesson from firing an unbounded Responses API
 * burst and retries only transport/rate-limit failures. Semantic validation
 * failures are deliberately not repeated here because their regional repair
 * belongs to the caller.
 */
export async function generateStructured<T>(
  input: StructuredGenerationInput,
): Promise<StructuredGeneration<T>> {
  const release = await acquireCallSlot();
  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await generateStructuredWithOpenAI<T>(input);
      } catch (error) {
        if (attempt >= TRANSIENT_RETRIES || !transientModelError(error)) {
          throw error;
        }
        const retry = attempt + 1;
        const delayMs = retryDelayMs(retry);
        const message = error instanceof Error ? error.message : String(error);
        await saveGenerationTrace({
          trace: input.trace,
          name: input.name,
          eventType: "transport_retry",
          attempt: retry,
          model: input.model,
          prompt: input.prompt,
          issues: [message],
          metadata: {
            retry,
            maxRetries: TRANSIENT_RETRIES,
            delayMs,
          },
        });
        console.warn("Retrying transient OpenAI structured generation.", {
          name: input.name,
          retry,
          maxRetries: TRANSIENT_RETRIES,
          delayMs,
          message,
        });
        await sleep(delayMs);
      }
    }
  } finally {
    release();
  }
}
