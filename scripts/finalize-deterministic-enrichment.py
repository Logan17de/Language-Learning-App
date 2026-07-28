from pathlib import Path

mapping = Path("lib/gemini/library-enrichment-mapping.ts")
text = mapping.read_text()
old = '''  return {
    kanji: request.kanji.map((character, requestIndex) => {
      const { requestIndex: _ignored, ...metadata } = kanjiByIndex.get(requestIndex)!;
      return { character, ...metadata };
    }),
    grammar: request.grammar.map((pattern, requestIndex) => {
      const { requestIndex: _ignored, ...metadata } = grammarByIndex.get(requestIndex)!;
      return { pattern, ...metadata };
    }),
    vocabulary: request.vocabulary.map((requested, requestIndex) => {
      const { requestIndex: _ignored, reading: _modelReading, ...metadata } =
        vocabularyByIndex.get(requestIndex)!;
      return {
        writtenForm: normalizeJapaneseLookup(requested.writtenForm),
        reading: normalizeJapaneseLookup(requested.readingHint),
        ...metadata,
        linkedKanjiCharacters: linkedKanjiForWord(
          requested.writtenForm,
          request.allowedKanji,
        ),
      };
    }),
  };
'''
new = '''  return {
    kanji: request.kanji.map((character, requestIndex) => {
      const item = kanjiByIndex.get(requestIndex)!;
      return {
        meanings: item.meanings,
        readings: item.readings,
        onyomi: item.onyomi,
        kunyomi: item.kunyomi,
        exampleWords: item.exampleWords,
        strokeCount: item.strokeCount,
        character,
      };
    }),
    grammar: request.grammar.map((pattern, requestIndex) => {
      const item = grammarByIndex.get(requestIndex)!;
      return {
        meaning: item.meaning,
        formation: item.formation,
        usageNotes: item.usageNotes,
        nuance: item.nuance,
        exampleSentences: item.exampleSentences,
        pattern,
      };
    }),
    vocabulary: request.vocabulary.map((requested, requestIndex) => {
      const item = vocabularyByIndex.get(requestIndex)!;
      return {
        meaning: item.meaning,
        partOfSpeech: item.partOfSpeech,
        tags: item.tags,
        exampleSentence: item.exampleSentence,
        writtenForm: normalizeJapaneseLookup(requested.writtenForm),
        reading: normalizeJapaneseLookup(requested.readingHint),
        linkedKanjiCharacters: linkedKanjiForWord(
          requested.writtenForm,
          request.allowedKanji,
        ),
      };
    }),
  };
'''
if old not in text:
    raise SystemExit("mapping return block not found")
mapping.write_text(text.replace(old, new, 1))

Path(".github/workflows/validate.yml").write_text('''name: Validate application

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

diagnostic = Path("diagnostics/test-failure.txt")
if diagnostic.exists():
    diagnostic.unlink()
try:
    Path("diagnostics").rmdir()
except OSError:
    pass

Path("scripts/finalize-deterministic-enrichment.py").unlink()
