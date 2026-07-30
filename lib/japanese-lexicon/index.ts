// Runtime pieces are generated from the independently tested
// @aiko/japanese-lexicon 6.0.1 package. This TypeScript adapter exposes only
// the server APIs AIko needs while keeping the package's schema-v4 contract.
import {
  buildVerbStems as runtimeBuildVerbStems,
  createGeneratedForm as runtimeCreateGeneratedForm,
  generateEntryForms as runtimeGenerateEntryForms,
} from "./runtime/conjugation.js";
import {
  canonicalSurface as runtimeCanonicalSurface,
  containsKanji as runtimeContainsKanji,
  containsPunctuationOrSpace as runtimeContainsPunctuationOrSpace,
  normalizeJapanese as runtimeNormalizeJapanese,
} from "./runtime/normalize.js";
import {
  SUPPORTED_VERB_TRANSFORMATION_CHAINS as runtimeSupportedVerbChains,
  isSupportedTransformationChain as runtimeIsSupportedTransformationChain,
} from "./runtime/transformation-policy.js";

export const PARTS_OF_SPEECH = [
  "verb",
  "i-adjective",
  "na-adjective",
  "noun",
  "adverb",
  "particle",
  "auxiliary",
  "conjunction",
  "expression",
  "counter",
  "prefix",
  "suffix",
  "pronoun",
  "interjection",
  "other",
] as const;

export const VERB_TYPES = [
  "ichidan",
  "godan-u",
  "godan-ku",
  "godan-gu",
  "godan-su",
  "godan-tsu",
  "godan-nu",
  "godan-bu",
  "godan-mu",
  "godan-ru",
  "suru",
  "kuru",
  "aru",
] as const;

export const FORM_CODES = [
  "dictionary",
  "plain-non-past",
  "polite-non-past",
  "polite-negative",
  "polite-past",
  "polite-negative-past",
  "plain-negative",
  "plain-past",
  "plain-negative-past",
  "te-form",
  "te-iru",
  "casual-te-iru",
  "potential",
  "passive",
  "causative",
  "desire",
  "te-shimau",
  "negative-conditional",
  "casual-contraction",
] as const;

export type PartOfSpeech = (typeof PARTS_OF_SPEECH)[number];
export type VerbType = (typeof VERB_TYPES)[number];
export type FormCode = (typeof FORM_CODES)[number];

export interface FormSpelling {
  surface: string;
  kana: string;
}

export type FormOverrides = Partial<Record<FormCode, FormSpelling>>;

export interface LexiconEntry {
  id: string;
  kanji: string;
  kana: string;
  meaning: string;
  partOfSpeech: PartOfSpeech;
  conjugationType?: VerbType;
  aliases: string[];
  formOverrides?: FormOverrides;
  source: "seed" | "gemini" | "manual" | "migration";
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedForm {
  code: FormCode;
  label: string;
  surface: string;
  kana: string;
  transformations: FormCode[];
}

export interface LookupCandidate {
  entry: LexiconEntry;
  form: GeneratedForm;
  matchedSpelling: string;
  matchedThroughAlias: boolean;
}

interface VerbStems {
  dictionarySurface: string;
  dictionaryKana: string;
  politeStemSurface: string;
  politeStemKana: string;
  negativeStemSurface: string;
  negativeStemKana: string;
  potentialStemSurface: string;
  potentialStemKana: string;
  teSurface: string;
  teKana: string;
  pastSurface: string;
  pastKana: string;
}

interface CompositionState {
  entry: LexiconEntry;
  teSource?: FormSpelling;
}

const buildVerbStems = runtimeBuildVerbStems as (entry: LexiconEntry) => VerbStems;
const createGeneratedForm = runtimeCreateGeneratedForm as (
  code: FormCode,
  surface: string,
  kana: string,
  transformations?: FormCode[],
) => GeneratedForm;
const generateEntryForms = runtimeGenerateEntryForms as (
  entry: LexiconEntry,
) => GeneratedForm[];
export const normalizeJapanese = runtimeNormalizeJapanese as (value: unknown) => string;
export const canonicalSurface = runtimeCanonicalSurface as (
  kanji: unknown,
  kana: unknown,
) => string;
export const containsKanji = runtimeContainsKanji as (value: unknown) => boolean;
export const containsPunctuationOrSpace = runtimeContainsPunctuationOrSpace as (
  value: unknown,
) => boolean;
export const SUPPORTED_VERB_TRANSFORMATION_CHAINS = runtimeSupportedVerbChains as FormCode[][];
export const isSupportedTransformationChain = runtimeIsSupportedTransformationChain as (
  entry: LexiconEntry,
  transformations: readonly FormCode[],
) => boolean;

function temporaryEntry(
  source: LexiconEntry,
  surface: string,
  kana: string,
  partOfSpeech: PartOfSpeech,
  conjugationType?: VerbType,
): LexiconEntry {
  const { conjugationType: _type, formOverrides: _overrides, ...base } = source;
  return {
    ...base,
    kanji: containsKanji(surface) ? surface : "",
    kana,
    partOfSpeech,
    ...(conjugationType ? { conjugationType } : {}),
    aliases: [],
  };
}

function overriddenSpelling(
  entry: LexiconEntry,
  code: FormCode,
): FormSpelling | undefined {
  const override = entry.formOverrides?.[code];
  return override
    ? {
        surface: normalizeJapanese(override.surface),
        kana: normalizeJapanese(override.kana),
      }
    : undefined;
}

function replaceDictionaryEnding(
  value: string,
  ending: string,
  replacement: string,
): string | null {
  return value.endsWith(ending)
    ? value.slice(0, -ending.length) + replacement
    : null;
}

function derivedVerbState(
  entry: LexiconEntry,
  transformation: "potential" | "passive" | "causative",
): CompositionState | null {
  if (entry.partOfSpeech !== "verb" || !entry.conjugationType) return null;
  const override = overriddenSpelling(entry, transformation);
  if (override) {
    return {
      entry: temporaryEntry(
        entry,
        override.surface,
        override.kana,
        "verb",
        "ichidan",
      ),
    };
  }
  if (entry.conjugationType === "aru") return null;

  const stems = buildVerbStems(entry);
  const type = entry.conjugationType;
  let surface: string | null = null;
  let kana: string | null = null;

  if (transformation === "potential") {
    surface = stems.potentialStemSurface + "る";
    kana = stems.potentialStemKana + "る";
  } else if (transformation === "passive") {
    if (type === "ichidan" || type === "kuru") {
      surface = stems.potentialStemSurface + "る";
      kana = stems.potentialStemKana + "る";
    } else if (type === "suru") {
      surface = replaceDictionaryEnding(stems.dictionarySurface, "する", "される");
      kana = replaceDictionaryEnding(stems.dictionaryKana, "する", "される");
    } else {
      surface = stems.negativeStemSurface + "れる";
      kana = stems.negativeStemKana + "れる";
    }
  } else if (type === "ichidan") {
    surface = replaceDictionaryEnding(stems.dictionarySurface, "る", "させる");
    kana = replaceDictionaryEnding(stems.dictionaryKana, "る", "させる");
  } else if (type === "suru") {
    surface = replaceDictionaryEnding(stems.dictionarySurface, "する", "させる");
    kana = replaceDictionaryEnding(stems.dictionaryKana, "する", "させる");
  } else if (type === "kuru") {
    surface = stems.negativeStemSurface + "させる";
    kana = stems.negativeStemKana + "させる";
  } else {
    surface = stems.negativeStemSurface + "せる";
    kana = stems.negativeStemKana + "せる";
  }

  if (!surface || !kana) return null;
  return {
    entry: temporaryEntry(entry, surface, kana, "verb", "ichidan"),
  };
}

function desireState(entry: LexiconEntry): CompositionState | null {
  if (entry.partOfSpeech !== "verb") return null;
  const override = overriddenSpelling(entry, "desire");
  let surface: string;
  let kana: string;
  if (override) {
    ({ surface, kana } = override);
  } else {
    const stems = buildVerbStems(entry);
    surface = stems.politeStemSurface + "たい";
    kana = stems.politeStemKana + "たい";
  }
  return { entry: temporaryEntry(entry, surface, kana, "i-adjective") };
}

function teBasedState(
  entry: LexiconEntry,
  transformation: "te-iru" | "te-shimau",
): CompositionState | null {
  if (entry.partOfSpeech !== "verb") return null;
  const override = overriddenSpelling(entry, transformation);
  const teForm = generateEntryForms(entry).find((item) => item.code === "te-form");
  if (!teForm && !override) return null;
  const surface =
    override?.surface ??
    `${teForm!.surface}${transformation === "te-iru" ? "いる" : "しまう"}`;
  const kana =
    override?.kana ??
    `${teForm!.kana}${transformation === "te-iru" ? "いる" : "しまう"}`;
  return {
    entry: temporaryEntry(
      entry,
      surface,
      kana,
      "verb",
      transformation === "te-iru" ? "ichidan" : "godan-u",
    ),
    ...(teForm
      ? { teSource: { surface: teForm.surface, kana: teForm.kana } }
      : {}),
  };
}

function negativeConditional(entry: LexiconEntry): FormSpelling | null {
  if (entry.partOfSpeech !== "verb") return null;
  const override = overriddenSpelling(entry, "negative-conditional");
  if (override) return override;
  const stems = buildVerbStems(entry);
  if (entry.conjugationType === "aru") {
    return { surface: "なければ", kana: "なければ" };
  }
  return {
    surface: stems.negativeStemSurface + "なければ",
    kana: stems.negativeStemKana + "なければ",
  };
}

function directForm(entry: LexiconEntry, code: FormCode): GeneratedForm | null {
  if (code === "plain-non-past" && entry.partOfSpeech === "verb") {
    return generateEntryForms(entry).find((item) => item.code === "dictionary") ?? null;
  }
  return generateEntryForms(entry).find((item) => item.code === code) ?? null;
}

export function composeEntryForm(
  entry: LexiconEntry,
  transformations: readonly FormCode[],
): GeneratedForm | null {
  const ordered = [...transformations];
  if (!isSupportedTransformationChain(entry, ordered)) return null;
  if (ordered.length === 0) return directForm(entry, "dictionary");

  if (ordered.length === 1) {
    const override = overriddenSpelling(entry, ordered[0]!);
    if (override) {
      return createGeneratedForm(
        ordered[0]!,
        override.surface,
        override.kana,
        ordered,
      );
    }
  }

  let state: CompositionState = { entry };
  for (let index = 0; index < ordered.length; index += 1) {
    const transformation = ordered[index]!;
    const last = index === ordered.length - 1;

    if (
      transformation === "potential" ||
      transformation === "passive" ||
      transformation === "causative"
    ) {
      const next = derivedVerbState(state.entry, transformation);
      if (!next) return null;
      state = next;
      if (last) {
        const dictionary = directForm(state.entry, "dictionary");
        return dictionary
          ? createGeneratedForm(
              transformation,
              dictionary.surface,
              dictionary.kana,
              ordered,
            )
          : null;
      }
      continue;
    }

    if (transformation === "desire") {
      const next = desireState(state.entry);
      if (!next) return null;
      state = next;
      if (last) {
        const dictionary = directForm(state.entry, "dictionary");
        return dictionary
          ? createGeneratedForm(
              transformation,
              dictionary.surface,
              dictionary.kana,
              ordered,
            )
          : null;
      }
      continue;
    }

    if (transformation === "te-iru" || transformation === "te-shimau") {
      const next = teBasedState(state.entry, transformation);
      if (!next) return null;
      state = next;
      if (last) {
        const dictionary = directForm(state.entry, "dictionary");
        return dictionary
          ? createGeneratedForm(
              transformation,
              dictionary.surface,
              dictionary.kana,
              ordered,
            )
          : null;
      }
      continue;
    }

    if (transformation === "casual-te-iru") {
      if (!last || state.entry.partOfSpeech !== "verb") return null;
      const teForm = generateEntryForms(state.entry).find(
        (item) => item.code === "te-form",
      );
      return teForm
        ? createGeneratedForm(
            transformation,
            teForm.surface + "る",
            teForm.kana + "る",
            ordered,
          )
        : null;
    }

    if (transformation === "negative-conditional") {
      const conditional = negativeConditional(state.entry);
      if (!conditional) return null;
      if (last) {
        return createGeneratedForm(
          transformation,
          conditional.surface,
          conditional.kana,
          ordered,
        );
      }
      if (
        ordered[index + 1] !== "casual-contraction" ||
        index + 1 !== ordered.length - 1
      ) {
        return null;
      }
      return createGeneratedForm(
        "casual-contraction",
        `${conditional.surface.slice(0, -"なければ".length)}なきゃ`,
        `${conditional.kana.slice(0, -"なければ".length)}なきゃ`,
        ordered,
      );
    }

    if (transformation === "casual-contraction") {
      if (ordered[index - 1] !== "te-shimau" || !state.teSource) return null;
      const surfaceVoiced = state.teSource.surface.endsWith("で");
      const kanaVoiced = state.teSource.kana.endsWith("で");
      const surfaceBase = state.teSource.surface.slice(0, -1);
      const kanaBase = state.teSource.kana.slice(0, -1);
      const outer = ordered[index + 1];
      if (last) {
        return createGeneratedForm(
          transformation,
          surfaceBase + (surfaceVoiced ? "じゃう" : "ちゃう"),
          kanaBase + (kanaVoiced ? "じゃう" : "ちゃう"),
          ordered,
        );
      }
      if (outer !== "plain-past" || index + 1 !== ordered.length - 1) {
        return null;
      }
      return createGeneratedForm(
        outer,
        surfaceBase + (surfaceVoiced ? "じゃった" : "ちゃった"),
        kanaBase + (kanaVoiced ? "じゃった" : "ちゃった"),
        ordered,
      );
    }

    if (!last) return null;
    const generated = directForm(state.entry, transformation);
    return generated
      ? createGeneratedForm(
          transformation,
          generated.surface,
          generated.kana,
          ordered,
        )
      : null;
  }
  return null;
}

function supportedChains(entry: LexiconEntry): FormCode[][] {
  if (entry.partOfSpeech === "verb") {
    return SUPPORTED_VERB_TRANSFORMATION_CHAINS;
  }
  return generateEntryForms(entry).map((form) => form.transformations);
}

function entryForSpelling(entry: LexiconEntry, spelling: string): LexiconEntry {
  const normalized = normalizeJapanese(spelling);
  return containsKanji(normalized)
    ? { ...entry, kanji: normalized, aliases: [] }
    : { ...entry, kanji: "", kana: normalized, aliases: [] };
}

function matchEntrySpelling(
  entry: LexiconEntry,
  spelling: string,
  surface: string,
  matchedThroughAlias: boolean,
): LookupCandidate[] {
  const candidateEntry = entryForSpelling(entry, spelling);
  const normalizedSurface = normalizeJapanese(surface);
  const results: LookupCandidate[] = [];
  for (const transformations of supportedChains(candidateEntry)) {
    let form: GeneratedForm | null = null;
    try {
      form = composeEntryForm(candidateEntry, transformations);
    } catch {
      form = null;
    }
    if (!form) continue;
    if (form.surface !== normalizedSurface && form.kana !== normalizedSurface) continue;
    results.push({ entry, form, matchedSpelling: spelling, matchedThroughAlias });
  }
  return results;
}

export function lookupSurface(
  entries: readonly LexiconEntry[],
  surfaceValue: string,
): LookupCandidate[] {
  const surface = normalizeJapanese(surfaceValue);
  if (!surface) return [];
  const results = entries.flatMap((entry) => [
    ...matchEntrySpelling(
      entry,
      canonicalSurface(entry.kanji, entry.kana),
      surface,
      false,
    ),
    ...entry.aliases.flatMap((alias) =>
      matchEntrySpelling(entry, alias, surface, true),
    ),
  ]);
  const seen = new Set<string>();
  return results.filter((candidate) => {
    const key = [
      candidate.entry.id,
      candidate.form.transformations.join("|"),
      candidate.matchedSpelling,
    ].join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function surfaceBelongsToEntry(
  surface: string,
  entry: LexiconEntry,
): boolean {
  return lookupSurface([entry], surface).length > 0;
}

export function assertSurfaceBelongsToEntry(
  surface: string,
  entry: LexiconEntry,
): void {
  if (surfaceBelongsToEntry(surface, entry)) return;
  throw new Error(
    `${normalizeJapanese(surface)} cannot be derived from ${canonicalSurface(
      entry.kanji,
      entry.kana,
    )}.`,
  );
}
