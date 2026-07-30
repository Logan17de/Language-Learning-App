/* eslint-disable */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FORM_LABELS = void 0;
exports.buildVerbStems = buildVerbStems;
exports.createGeneratedForm = createGeneratedForm;
exports.generateVerbForms = generateVerbForms;
exports.generateIAdjectiveForms = generateIAdjectiveForms;
exports.generateCopulaForms = generateCopulaForms;
exports.generateEntryForms = generateEntryForms;
const normalize_js_1 = require("./normalize.js");
exports.FORM_LABELS = {
    dictionary: "dictionary form",
    "plain-non-past": "plain/casual non-past",
    "polite-non-past": "polite non-past",
    "polite-negative": "polite negative",
    "polite-past": "polite past",
    "polite-negative-past": "polite negative past",
    "plain-negative": "plain/casual negative",
    "plain-past": "plain/casual past",
    "plain-negative-past": "plain/casual negative past",
    "te-form": "て-form",
    "te-iru": "ている form",
    "casual-te-iru": "contracted てる form",
    potential: "potential form — can do",
    passive: "passive form — be done",
    causative: "causative form — make or let someone do",
    desire: "たい form — want to do",
    "te-shimau": "てしまう — completion, unintended result, or regret",
    "negative-conditional": "なければ — if not",
    "casual-contraction": "casual contraction",
};
const GODAN = {
    "godan-u": { dictionaryEnd: "う", iEnd: "い", aEnd: "わ", teEnd: "って", pastEnd: "った" },
    "godan-ku": { dictionaryEnd: "く", iEnd: "き", aEnd: "か", teEnd: "いて", pastEnd: "いた" },
    "godan-gu": { dictionaryEnd: "ぐ", iEnd: "ぎ", aEnd: "が", teEnd: "いで", pastEnd: "いだ" },
    "godan-su": { dictionaryEnd: "す", iEnd: "し", aEnd: "さ", teEnd: "して", pastEnd: "した" },
    "godan-tsu": { dictionaryEnd: "つ", iEnd: "ち", aEnd: "た", teEnd: "って", pastEnd: "った" },
    "godan-nu": { dictionaryEnd: "ぬ", iEnd: "に", aEnd: "な", teEnd: "んで", pastEnd: "んだ" },
    "godan-bu": { dictionaryEnd: "ぶ", iEnd: "び", aEnd: "ば", teEnd: "んで", pastEnd: "んだ" },
    "godan-mu": { dictionaryEnd: "む", iEnd: "み", aEnd: "ま", teEnd: "んで", pastEnd: "んだ" },
    "godan-ru": { dictionaryEnd: "る", iEnd: "り", aEnd: "ら", teEnd: "って", pastEnd: "った" },
};
function replaceEnding(value, oldEnding, newEnding) {
    if (!value.endsWith(oldEnding)) throw new Error(`"${value}" does not end with "${oldEnding}". Check its conjugation type.`);
    return value.slice(0, -oldEnding.length) + newEnding;
}
function kuruStems(surface, kana) {
    if (!kana.endsWith("くる")) throw new Error(`Kuru verb kana must end in くる: ${kana}`);
    const kanaPrefix = kana.slice(0, -"くる".length);
    const writtenKuru = surface.endsWith("来る");
    const kanaKuru = surface.endsWith("くる");
    if (!writtenKuru && !kanaKuru) throw new Error(`Kuru verb surface must end in 来る or くる: ${surface}`);
    const surfacePrefix = surface.slice(0, -(writtenKuru ? "来る".length : "くる".length));
    const politeStemSurface = surfacePrefix + (writtenKuru ? "来" : "き");
    const negativeStemSurface = surfacePrefix + (writtenKuru ? "来" : "こ");
    const teSurface = surfacePrefix + (writtenKuru ? "来て" : "きて");
    const pastSurface = surfacePrefix + (writtenKuru ? "来た" : "きた");
    return { dictionarySurface: surface, dictionaryKana: kana, politeStemSurface, politeStemKana: kanaPrefix + "き", negativeStemSurface, negativeStemKana: kanaPrefix + "こ", potentialStemSurface: surfacePrefix + (writtenKuru ? "来られ" : "こられ"), potentialStemKana: kanaPrefix + "こられ", teSurface, teKana: kanaPrefix + "きて", pastSurface, pastKana: kanaPrefix + "きた" };
}
function buildVerbStems(entry) {
    const surface = (0, normalize_js_1.canonicalSurface)(entry.kanji, entry.kana);
    const kana = entry.kana;
    const type = entry.conjugationType;
    if (!type) throw new Error(`Verb ${entry.id} needs a conjugation type.`);
    if (type === "ichidan") {
        const surfaceStem = replaceEnding(surface, "る", "");
        const kanaStem = replaceEnding(kana, "る", "");
        return { dictionarySurface: surface, dictionaryKana: kana, politeStemSurface: surfaceStem, politeStemKana: kanaStem, negativeStemSurface: surfaceStem, negativeStemKana: kanaStem, potentialStemSurface: surfaceStem + "られ", potentialStemKana: kanaStem + "られ", teSurface: surfaceStem + "て", teKana: kanaStem + "て", pastSurface: surfaceStem + "た", pastKana: kanaStem + "た" };
    }
    if (type === "suru") {
        const surfaceBase = replaceEnding(surface, "する", "");
        const kanaBase = replaceEnding(kana, "する", "");
        return { dictionarySurface: surface, dictionaryKana: kana, politeStemSurface: surfaceBase + "し", politeStemKana: kanaBase + "し", negativeStemSurface: surfaceBase + "し", negativeStemKana: kanaBase + "し", potentialStemSurface: surfaceBase + "でき", potentialStemKana: kanaBase + "でき", teSurface: surfaceBase + "して", teKana: kanaBase + "して", pastSurface: surfaceBase + "した", pastKana: kanaBase + "した" };
    }
    if (type === "kuru") return kuruStems(surface, kana);
    if (type === "aru") {
        return { dictionarySurface: surface, dictionaryKana: kana, politeStemSurface: replaceEnding(surface, "る", "り"), politeStemKana: replaceEnding(kana, "る", "り"), negativeStemSurface: "", negativeStemKana: "", potentialStemSurface: "", potentialStemKana: "", teSurface: replaceEnding(surface, "る", "って"), teKana: replaceEnding(kana, "る", "って"), pastSurface: replaceEnding(surface, "る", "った"), pastKana: replaceEnding(kana, "る", "った") };
    }
    const rule = GODAN[type];
    const ikuFamily = type === "godan-ku" && kana.endsWith("いく") && (surface.endsWith("行く") || surface.endsWith("いく"));
    const teEnd = ikuFamily ? "って" : rule.teEnd;
    const pastEnd = ikuFamily ? "った" : rule.pastEnd;
    const eRow = { う: "え", く: "け", ぐ: "げ", す: "せ", つ: "て", ぬ: "ね", ぶ: "べ", む: "め", る: "れ" };
    const eEnd = eRow[rule.dictionaryEnd];
    if (!eEnd) throw new Error(`Missing potential-stem rule for ${type}.`);
    return { dictionarySurface: surface, dictionaryKana: kana, politeStemSurface: replaceEnding(surface, rule.dictionaryEnd, rule.iEnd), politeStemKana: replaceEnding(kana, rule.dictionaryEnd, rule.iEnd), negativeStemSurface: replaceEnding(surface, rule.dictionaryEnd, rule.aEnd), negativeStemKana: replaceEnding(kana, rule.dictionaryEnd, rule.aEnd), potentialStemSurface: replaceEnding(surface, rule.dictionaryEnd, eEnd), potentialStemKana: replaceEnding(kana, rule.dictionaryEnd, eEnd), teSurface: replaceEnding(surface, rule.dictionaryEnd, teEnd), teKana: replaceEnding(kana, rule.dictionaryEnd, teEnd), pastSurface: replaceEnding(surface, rule.dictionaryEnd, pastEnd), pastKana: replaceEnding(kana, rule.dictionaryEnd, pastEnd) };
}
function createGeneratedForm(code, surface, kana, transformations = code === "dictionary" ? [] : [code]) {
    return { code, label: transformations.length > 1 ? transformations.map((transformation) => exports.FORM_LABELS[transformation]).join(" + ") : exports.FORM_LABELS[code], surface: (0, normalize_js_1.normalizeJapanese)(surface), kana: (0, normalize_js_1.normalizeJapanese)(kana), transformations };
}
function form(code, surface, kana) { return createGeneratedForm(code, surface, kana); }
function applyOverrides(entry, forms) {
    const overrides = entry.formOverrides;
    if (!overrides) return forms;
    return forms.map((generated) => { const override = overrides[generated.code]; return override ? form(generated.code, override.surface, override.kana) : generated; });
}
function generateVerbForms(entry) {
    if (entry.partOfSpeech !== "verb") throw new Error(`${entry.id} is not a verb.`);
    const stems = buildVerbStems(entry);
    const aru = entry.conjugationType === "aru";
    const plainNegative = aru ? form("plain-negative", "ない", "ない") : form("plain-negative", stems.negativeStemSurface + "ない", stems.negativeStemKana + "ない");
    const plainNegativePast = aru ? form("plain-negative-past", "なかった", "なかった") : form("plain-negative-past", stems.negativeStemSurface + "なかった", stems.negativeStemKana + "なかった");
    return applyOverrides(entry, [form("dictionary", stems.dictionarySurface, stems.dictionaryKana), form("polite-non-past", stems.politeStemSurface + "ます", stems.politeStemKana + "ます"), form("polite-negative", stems.politeStemSurface + "ません", stems.politeStemKana + "ません"), form("polite-past", stems.politeStemSurface + "ました", stems.politeStemKana + "ました"), form("polite-negative-past", stems.politeStemSurface + "ませんでした", stems.politeStemKana + "ませんでした"), plainNegative, form("plain-past", stems.pastSurface, stems.pastKana), plainNegativePast, form("te-form", stems.teSurface, stems.teKana), form("te-iru", stems.teSurface + "いる", stems.teKana + "いる"), form("casual-te-iru", stems.teSurface + "る", stems.teKana + "る")]);
}
function generateIAdjectiveForms(entry) {
    if (entry.partOfSpeech !== "i-adjective") throw new Error(`${entry.id} is not an i-adjective.`);
    const surface = (0, normalize_js_1.canonicalSurface)(entry.kanji, entry.kana);
    if (!surface.endsWith("い") || !entry.kana.endsWith("い")) throw new Error(`I-adjective must end in い: ${surface}`);
    const isIiFamily = entry.kana === "いい" || entry.kana === "よい";
    const surfaceStem = isIiFamily && (surface === "いい" || surface === "よい") ? "よ" : surface.slice(0, -"い".length);
    const kanaStem = isIiFamily ? "よ" : entry.kana.slice(0, -"い".length);
    return applyOverrides(entry, [form("dictionary", surface, entry.kana), form("polite-non-past", surface + "です", entry.kana + "です"), form("polite-negative", surfaceStem + "くないです", kanaStem + "くないです"), form("polite-past", surfaceStem + "かったです", kanaStem + "かったです"), form("polite-negative-past", surfaceStem + "くなかったです", kanaStem + "くなかったです"), form("plain-negative", surfaceStem + "くない", kanaStem + "くない"), form("plain-past", surfaceStem + "かった", kanaStem + "かった"), form("plain-negative-past", surfaceStem + "くなかった", kanaStem + "くなかった"), form("te-form", surfaceStem + "くて", kanaStem + "くて")]);
}
function generateCopulaForms(entry) {
    if (entry.partOfSpeech !== "noun" && entry.partOfSpeech !== "na-adjective") throw new Error(`${entry.id} cannot use copula forms.`);
    const surface = (0, normalize_js_1.canonicalSurface)(entry.kanji, entry.kana);
    const kana = entry.kana;
    return applyOverrides(entry, [form("dictionary", surface, kana), form("plain-non-past", surface + "だ", kana + "だ"), form("polite-non-past", surface + "です", kana + "です"), form("polite-negative", surface + "ではありません", kana + "ではありません"), form("polite-past", surface + "でした", kana + "でした"), form("polite-negative-past", surface + "ではありませんでした", kana + "ではありませんでした"), form("plain-negative", surface + "じゃない", kana + "じゃない"), form("plain-past", surface + "だった", kana + "だった"), form("plain-negative-past", surface + "じゃなかった", kana + "じゃなかった"), form("te-form", surface + "で", kana + "で")]);
}
function generateEntryForms(entry) {
    if (entry.partOfSpeech === "verb") return generateVerbForms(entry);
    if (entry.partOfSpeech === "i-adjective") return generateIAdjectiveForms(entry);
    if (entry.partOfSpeech === "noun" || entry.partOfSpeech === "na-adjective") return generateCopulaForms(entry);
    return [form("dictionary", (0, normalize_js_1.canonicalSurface)(entry.kanji, entry.kana), entry.kana)];
}
