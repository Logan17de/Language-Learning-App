from pathlib import Path

ENGINE = Path("lib/gemini/lesson-engine-v2.ts")
LIBRARY = Path("lib/gemini/lesson-library-v2.ts")
CONTRACT_TEST = Path("tests/custom-lesson-engine.test.ts")
VALIDATE = Path(".github/workflows/validate.yml")
HELPER = Path("lib/gemini/grammar-pattern-learning.ts")
SELF = Path("scripts/apply-deterministic-library-enrichment.py")

engine = ENGINE.read_text()
import_anchor = 'import { storyUsesGrammarPattern } from "@/lib/gemini/lesson-validation";\n'
import_block = '''import {
  libraryEnrichmentIssues,
  libraryEnrichmentPrompt,
  libraryEnrichmentSchema,
  mapLibraryEnrichment,
  type RawLibraryEnrichment,
} from "@/lib/gemini/library-enrichment-mapping";
'''
if import_block not in engine:
    if import_anchor not in engine:
        raise SystemExit("lesson-engine import anchor not found")
    engine = engine.replace(import_anchor, import_anchor + import_block, 1)

start = engine.find("function librarySchema(request: LibraryEnrichmentRequest): JsonSchema {")
end = engine.find("export async function generateLibraryEnrichment(", start)
if start < 0 or end < 0:
    raise SystemExit("library schema block not found")
engine = engine[:start] + engine[end:]

start = engine.find("export async function generateLibraryEnrichment(")
end = engine.find("export async function generatePlayableLesson(", start)
if start < 0 or end < 0:
    raise SystemExit("library enrichment function block not found")
new_function = '''export async function generateLibraryEnrichment(
  request: LibraryEnrichmentRequest,
): Promise<{
  seed: LibrarySeed;
  model: string;
  audit: GenerationAuditEntry;
}> {
  const result = await generateStructured<RawLibraryEnrichment>({
    name: "library enrichment",
    prompt: libraryEnrichmentPrompt(request),
    schema: libraryEnrichmentSchema(request),
    validate: (value) => libraryEnrichmentIssues(value, request),
  });
  const seed = mapLibraryEnrichment(result.value, request) as LibrarySeed;
  return {
    seed,
    model: result.model,
    audit: {
      stage: "library",
      model: result.model,
      repaired: result.repaired,
    },
  };
}

'''
engine = engine[:start] + new_function + engine[end:]
ENGINE.write_text(engine)

library = LIBRARY.read_text()
library = library.replace(
    'import { canonicalizeLearnedGrammarPatterns } from "@/lib/gemini/grammar-pattern-learning";\n',
    "",
)
old = '''    const learnedGrammar = await canonicalizeLearnedGrammarPatterns({
      requestedPatterns: unknownGrammar,
      generatedGrammar: enrichment.seed.grammar,
    });
    const canonicalSeed = {
      ...enrichment.seed,
      grammar: learnedGrammar,
    };
    const stored = await client.rpc("enrich_custom_lesson_library_v2", {
      p_level: input.level,
      p_seed: canonicalSeed as unknown as Json,
      p_source_model: enrichment.model,
    });
'''
new = '''    const stored = await client.rpc("enrich_custom_lesson_library_v2", {
      p_level: input.level,
      p_seed: enrichment.seed as unknown as Json,
      p_source_model: enrichment.model,
    });
'''
if old not in library:
    raise SystemExit("lesson-library alias integration block not found")
library = library.replace(old, new, 1)
LIBRARY.write_text(library)

contract = CONTRACT_TEST.read_text()
start = contract.find('  it("learns AI-confirmed grammar aliases without weakening kanji identity"')
if start >= 0:
    end = contract.find('  it("publishes lesson content before audio', start)
    if end < 0:
        raise SystemExit("contract alias test end not found")
    replacement = '''  it("keeps model-controlled identifiers out of library enrichment", () => {
    const engine = readFileSync("lib/gemini/lesson-engine-v2.ts", "utf8");
    const mapping = readFileSync("lib/gemini/library-enrichment-mapping.ts", "utf8");
    expect(engine).toContain("mapLibraryEnrichment");
    expect(mapping).toContain("requestIndex");
    expect(mapping).toContain("Do not output character, pattern, writtenForm");
    expect(mapping).toContain("linkedKanjiForWord");
  });

'''
    contract = contract[:start] + replacement + contract[end:]
CONTRACT_TEST.write_text(contract)

if HELPER.exists():
    HELPER.unlink()

VALIDATE.write_text('''name: Validate application

on:
  pull_request:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: validate-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  validate:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      NEXT_PUBLIC_SUPABASE_URL: https://example.supabase.co
      NEXT_PUBLIC_SUPABASE_ANON_KEY: test-anon-key
    steps:
      - name: Check out repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Type-check
        run: npm run typecheck

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build
''')

SELF.unlink()
