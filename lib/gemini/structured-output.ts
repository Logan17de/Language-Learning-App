// Compatibility export for existing generator modules. The live provider and
// transport live under lib/openai and use the OpenAI Responses API.
export {
  generateStructured,
  type JsonSchema,
  type StructuredGeneration,
} from "@/lib/openai/structured-output";
