/* eslint-disable */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertEnrichmentMatchesPending = assertEnrichmentMatchesPending;
exports.assertSurfaceBelongsToEntry = assertSurfaceBelongsToEntry;
const form_analysis_js_1 = require("./form-analysis.js");
const normalize_js_1 = require("./normalize.js");
function assertEnrichmentMatchesPending(pending, enrichment) {
    const expectedLemma = (0, normalize_js_1.normalizeJapanese)(pending.hints.dictionaryForm);
    const returnedLemma = (0, normalize_js_1.canonicalSurface)(enrichment.kanji, enrichment.kana);
    const returnedKana = (0, normalize_js_1.normalizeJapanese)(enrichment.kana);
    const returnedAliases = (enrichment.aliases ?? []).map((alias) => (0, normalize_js_1.normalizeJapanese)(alias));
    const canonicalMatches = !expectedLemma ||
        expectedLemma === returnedLemma ||
        expectedLemma === returnedKana;
    if (canonicalMatches && returnedAliases.length > 0) {
        throw new Error("Gemini enrichment must not add aliases when its canonical lemma already matches the pending hint.");
    }
    if (!canonicalMatches &&
        (returnedAliases.length !== 1 ||
            returnedAliases[0] !== expectedLemma)) {
        throw new Error(`Enrichment lemma mismatch: expected ${expectedLemma}, received ${returnedLemma}.`);
    }
    const expectedKana = (0, normalize_js_1.normalizeJapanese)(pending.hints.kana);
    if (expectedKana && expectedKana !== returnedKana) {
        throw new Error(`Kana mismatch: expected ${expectedKana}, received ${returnedKana}.`);
    }
    if (pending.hints.partOfSpeech &&
        pending.hints.partOfSpeech !== enrichment.partOfSpeech) {
        throw new Error(`Part-of-speech mismatch: expected ${pending.hints.partOfSpeech}, received ${enrichment.partOfSpeech}.`);
    }
    if (pending.hints.conjugationType &&
        pending.hints.conjugationType !== enrichment.conjugationType) {
        throw new Error(`Conjugation mismatch: expected ${pending.hints.conjugationType}, received ${enrichment.conjugationType ?? "none"}.`);
    }
    if (enrichment.partOfSpeech === "particle" ||
        enrichment.partOfSpeech === "auxiliary") {
        throw new Error("Particles and auxiliaries cannot be added through lexical enrichment.");
    }
    if (!canonicalMatches) {
        const alias = returnedAliases[0];
        const aliasEntry = {
            id: "pending-alias-proof",
            kanji: (0, normalize_js_1.containsKanji)(alias) ? alias : "",
            kana: (0, normalize_js_1.containsKanji)(alias) ? returnedKana : alias,
            meaning: enrichment.meaning,
            partOfSpeech: enrichment.partOfSpeech,
            ...(enrichment.conjugationType
                ? { conjugationType: enrichment.conjugationType }
                : {}),
            aliases: [],
            ...(enrichment.formOverrides
                ? { formOverrides: enrichment.formOverrides }
                : {}),
            source: enrichment.source ?? "gemini",
            createdAt: "1970-01-01T00:00:00.000Z",
            updatedAt: "1970-01-01T00:00:00.000Z",
        };
        let aliasProvesSurface = false;
        try {
            aliasProvesSurface = (0, form_analysis_js_1.surfaceBelongsToEntry)(pending.surface, aliasEntry);
        }
        catch {
            aliasProvesSurface = false;
        }
        if (!aliasProvesSurface) {
            throw new Error(`${(0, normalize_js_1.normalizeJapanese)(pending.surface)} cannot be derived from alias ${alias}.`);
        }
    }
}
function assertSurfaceBelongsToEntry(surface, entry) {
    if ((0, form_analysis_js_1.surfaceBelongsToEntry)(surface, entry))
        return;
    throw new Error(`${(0, normalize_js_1.normalizeJapanese)(surface)} cannot be derived from ${(0, normalize_js_1.canonicalSurface)(entry.kanji, entry.kana)}.`);
}
