# OpenAI lesson generation

AIko uses the server-side OpenAI Responses API for all custom-lesson text generation.

## Runtime defaults

- Model: `gpt-5.6-luna`
- Story reasoning: `low`
- Missing-word enrichment reasoning: `medium`
- Activity validation and isolated repair reasoning: `medium`
- Response storage: disabled with `store: false`

The existing architecture is unchanged: story generation runs first, the permanent lexicon and deterministic morphology engine resolve known words locally, and the enrichment request contains only unresolved word spans. Activity regions are generated in parallel, approved questions survive unchanged, and only rejected questions are repaired.

## Required server variables

```text
OPENAI_API_KEY=...
OPENAI_LESSON_MODEL=gpt-5.6-luna
OPENAI_STORY_REASONING_EFFORT=low
OPENAI_ENRICHMENT_REASONING_EFFORT=medium
OPENAI_VALIDATOR_REASONING_EFFORT=medium
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
```

An alternate text model is not used unless `OPENAI_LESSON_FALLBACK_MODEL` is explicitly configured. Gemini credentials and model variables are not read by the application.
