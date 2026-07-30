/* eslint-disable */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEntry = validateEntry;
exports.validatePendingWord = validatePendingWord;
exports.validateDatabase = validateDatabase;
exports.assertValidDatabase = assertValidDatabase;
const normalize_js_1 = require("./normalize.js");
const pending_js_1 = require("./pending.js");
const types_js_1 = require("./types.js");
const ENTRY_SOURCES = ["seed", "gemini", "manual", "migration"];
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function hasText(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function validDate(value) {
    return typeof value === "string" && !Number.isNaN(Date.parse(value));
}
function validateEntry(value) {
    if (!isRecord(value))
        return ["Lexicon entry must be an object."];
    const entry = value;
    const id = hasText(entry.id) ? entry.id : "Entry";
    const issues = [];
    if (!hasText(entry.id))
        issues.push("Entry id is required.");
    if (!hasText(entry.kanji) && entry.kanji !== "") {
        issues.push(`${id} kanji must be a string.`);
    }
    if (!hasText(entry.kana) || !(0, normalize_js_1.isKana)(entry.kana)) {
        issues.push(`${id} needs a kana-only reading.`);
    }
    if (!hasText(entry.meaning))
        issues.push(`${id} needs a meaning.`);
    if (!(0, normalize_js_1.isPartOfSpeech)(entry.partOfSpeech)) {
        issues.push(`${id} has an invalid part of speech.`);
    }
    if (hasText(entry.kanji) && !(0, normalize_js_1.containsKanji)(entry.kanji)) {
        issues.push(`${id} kanji must be empty for kana-only spellings.`);
    }
    if ((0, normalize_js_1.containsPunctuationOrSpace)(entry.kanji) ||
        (0, normalize_js_1.containsPunctuationOrSpace)(entry.kana)) {
        issues.push(`${id} spelling contains invalid punctuation or spacing.`);
    }
    if (!(0, normalize_js_1.canonicalSurface)(entry.kanji ?? "", entry.kana ?? "")) {
        issues.push(`${id} needs a canonical surface.`);
    }
    if (entry.partOfSpeech === "verb" &&
        !(0, normalize_js_1.isVerbType)(entry.conjugationType)) {
        issues.push(`${id} verb needs a conjugation type.`);
    }
    if (entry.partOfSpeech !== undefined &&
        entry.partOfSpeech !== "verb" &&
        entry.conjugationType !== undefined) {
        issues.push(`${id} cannot have a verb conjugation type.`);
    }
    if (!Array.isArray(entry.aliases)) {
        issues.push(`${id} aliases must be an array.`);
    }
    else if (entry.aliases.some((alias) => !hasText(alias))) {
        issues.push(`${id} aliases must contain non-empty strings.`);
    }
    else if (entry.aliases.some(normalize_js_1.containsPunctuationOrSpace)) {
        issues.push(`${id} aliases cannot contain punctuation or spacing.`);
    }
    if (!ENTRY_SOURCES.includes(entry.source)) {
        issues.push(`${id} has an invalid source.`);
    }
    if (!validDate(entry.createdAt) || !validDate(entry.updatedAt)) {
        issues.push(`${id} timestamps must be ISO dates.`);
    }
    if (entry.formOverrides !== undefined) {
        if (!isRecord(entry.formOverrides)) {
            issues.push(`${id} formOverrides must be an object.`);
        }
        else {
            for (const [code, spelling] of Object.entries(entry.formOverrides)) {
                if (!types_js_1.FORM_CODES.includes(code)) {
                    issues.push(`${id} has unknown form override ${code}.`);
                }
                if (!isRecord(spelling) ||
                    !hasText(spelling.surface) ||
                    !hasText(spelling.kana) ||
                    !(0, normalize_js_1.isKana)(spelling.kana)) {
                    issues.push(`${id} override ${code} is invalid.`);
                }
            }
        }
    }
    return issues;
}
function validatePendingWord(value) {
    if (!isRecord(value))
        return ["Pending word must be an object."];
    const word = value;
    const id = hasText(word.id) ? word.id : "Pending word";
    const issues = [];
    if (!hasText(word.id))
        issues.push("Pending word id is required.");
    if (!hasText(word.identityKey)) {
        issues.push(`${id} identity key is required.`);
    }
    if (!hasText(word.surface))
        issues.push(`${id} surface is required.`);
    if ((0, normalize_js_1.containsPunctuationOrSpace)(word.surface)) {
        issues.push(`${id} surface contains punctuation or spacing.`);
    }
    if (hasText(word.surface) &&
        (0, normalize_js_1.normalizeJapanese)(word.surface) !== word.normalizedSurface) {
        issues.push(`${id} normalized surface is stale.`);
    }
    if (!Number.isInteger(word.occurrences) || Number(word.occurrences) < 1) {
        issues.push(`${id} occurrences must be positive.`);
    }
    if (!Array.isArray(word.contexts)) {
        issues.push(`${id} contexts must be an array.`);
    }
    else {
        for (const context of word.contexts) {
            if (!isRecord(context) ||
                !Number.isInteger(context.lineNumber) ||
                !hasText(context.sentence)) {
                issues.push(`${id} contains an invalid context.`);
                break;
            }
        }
    }
    if (!isRecord(word.hints)) {
        issues.push(`${id} hints must be an object.`);
    }
    else {
        if (!hasText(word.hints.dictionaryForm)) {
            issues.push(`${id} needs a dictionary-form hint.`);
        }
        else if ((0, normalize_js_1.containsPunctuationOrSpace)(word.hints.dictionaryForm)) {
            issues.push(`${id} dictionary-form hint contains punctuation or spacing.`);
        }
        if (!(0, normalize_js_1.isPartOfSpeech)(word.hints.partOfSpeech)) {
            issues.push(`${id} needs a valid part-of-speech hint.`);
        }
        else if (word.hints.partOfSpeech === "particle" ||
            word.hints.partOfSpeech === "auxiliary") {
            issues.push(`${id} cannot queue a particle or auxiliary for lexical enrichment.`);
        }
        if (hasText(word.surface) &&
            hasText(word.identityKey) &&
            word.identityKey !== (0, pending_js_1.pendingIdentity)(word.surface, word.hints)) {
            issues.push(`${id} identity key is stale.`);
        }
        if (word.hints.partOfSpeech !== undefined &&
            !(0, normalize_js_1.isPartOfSpeech)(word.hints.partOfSpeech)) {
            issues.push(`${id} has an invalid part-of-speech hint.`);
        }
        if (word.hints.conjugationType !== undefined &&
            !(0, normalize_js_1.isVerbType)(word.hints.conjugationType)) {
            issues.push(`${id} has an invalid conjugation hint.`);
        }
    }
    if (!validDate(word.firstSeenAt) || !validDate(word.lastSeenAt)) {
        issues.push(`${id} timestamps must be ISO dates.`);
    }
    return issues;
}
function validateDatabase(value) {
    if (!isRecord(value))
        return ["Lexicon database must be an object."];
    const database = value;
    const issues = [];
    if (database.schemaVersion !== 4) {
        issues.push("Lexicon schemaVersion must be 4.");
    }
    if (!Array.isArray(database.entries)) {
        return [...issues, "Lexicon entries must be an array."];
    }
    if (!Array.isArray(database.pending)) {
        return [...issues, "Lexicon pending must be an array."];
    }
    const ids = new Set();
    const exactEntries = new Set();
    for (const rawEntry of database.entries) {
        issues.push(...validateEntry(rawEntry));
        if (!isRecord(rawEntry))
            continue;
        const id = (0, normalize_js_1.normalizeJapanese)(rawEntry.id);
        if (id && ids.has(id))
            issues.push(`Duplicate id: ${id}.`);
        if (id)
            ids.add(id);
        if (hasText(rawEntry.kana) &&
            hasText(rawEntry.meaning) &&
            hasText(rawEntry.partOfSpeech)) {
            const exactKey = [
                (0, normalize_js_1.canonicalSurface)((0, normalize_js_1.normalizeJapanese)(rawEntry.kanji), rawEntry.kana),
                (0, normalize_js_1.normalizeJapanese)(rawEntry.kana),
                rawEntry.partOfSpeech,
            ].join("\u0000");
            if (exactEntries.has(exactKey)) {
                issues.push(`Duplicate canonical entry: ${id || "(missing id)"}.`);
            }
            exactEntries.add(exactKey);
        }
    }
    const pendingIdentities = new Set();
    for (const rawPending of database.pending) {
        issues.push(...validatePendingWord(rawPending));
        if (!isRecord(rawPending))
            continue;
        const id = (0, normalize_js_1.normalizeJapanese)(rawPending.id);
        if (id && ids.has(id))
            issues.push(`Duplicate id: ${id}.`);
        if (id)
            ids.add(id);
        const identity = (0, normalize_js_1.normalizeJapanese)(rawPending.identityKey);
        if (identity && pendingIdentities.has(identity)) {
            issues.push(`Duplicate pending identity: ${identity}.`);
        }
        if (identity)
            pendingIdentities.add(identity);
    }
    return [...new Set(issues)];
}
function assertValidDatabase(database) {
    const issues = validateDatabase(database);
    if (issues.length > 0) {
        throw new Error(`Invalid lexicon database: ${issues.join(" ")}`);
    }
}
