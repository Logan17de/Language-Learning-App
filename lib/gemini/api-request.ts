export type GeminiJsonSchema = Record<string, unknown>;

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
      responseFormat: {
        text: {
          mimeType: "application/json",
          schema,
        },
      },
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
      schema,
    },
  };
}
