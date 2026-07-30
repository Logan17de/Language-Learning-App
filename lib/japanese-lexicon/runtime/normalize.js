/* eslint-disable */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeJapanese = normalizeJapanese;
exports.containsKanji = containsKanji;
exports.isKana = isKana;
exports.uniqueNormalized = uniqueNormalized;
exports.isPartOfSpeech = isPartOfSpeech;
exports.isVerbType = isVerbType;
exports.canonicalSurface = canonicalSurface;
exports.stripPunctuationAndSpacing = stripPunctuationAndSpacing;
exports.containsPunctuationOrSpace = containsPunctuationOrSpace;
const types_js_1 = require("./types.js");
const HAN = /\p{Script=Han}/u;
const KANA = /^[\p{Script=Hiragana}\p{Script=Katakana}ー・]+$/u;
function normalizeJapanese(value) {
    return typeof value === "string" ? value.normalize("NFKC").trim() : "";
}
function containsKanji(value) {
    return HAN.test(normalizeJapanese(value));
}
function isKana(value) {
    return KANA.test(normalizeJapanese(value));
}
function uniqueNormalized(values) {
    const seen = new Set();
    const result = [];
    for (const rawValue of values) {
        const value = normalizeJapanese(rawValue);
        if (!value || seen.has(value))
            continue;
        seen.add(value);
        result.push(value);
    }
    return result;
}
function isPartOfSpeech(value) {
    return (typeof value === "string" &&
        types_js_1.PARTS_OF_SPEECH.includes(value));
}
function isVerbType(value) {
    return (typeof value === "string" &&
        types_js_1.VERB_TYPES.includes(value));
}
function canonicalSurface(kanji, kana) {
    return normalizeJapanese(kanji) || normalizeJapanese(kana);
}
function stripPunctuationAndSpacing(value) {
    return normalizeJapanese(value).replace(/[\p{P}\p{Z}\s]/gu, "");
}
function containsPunctuationOrSpace(value) {
    const normalized = normalizeJapanese(value);
    if (/[\p{Z}\s]/u.test(normalized))
        return true;
    if (normalized.startsWith("・") ||
        normalized.endsWith("・") ||
        normalized.includes("・・")) {
        return true;
    }
    return /[\p{P}]/u.test(normalized.replaceAll("・", ""));
}
