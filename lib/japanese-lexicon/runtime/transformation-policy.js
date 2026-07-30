/* eslint-disable */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUPPORTED_VERB_TRANSFORMATION_CHAINS = void 0;
exports.isSupportedTransformationPattern = isSupportedTransformationPattern;
exports.isSupportedTransformationChain = isSupportedTransformationChain;
const types_js_1 = require("./types.js");
const DIRECT_VERB_FORMS = [
    "polite-non-past",
    "polite-negative",
    "polite-past",
    "polite-negative-past",
    "plain-negative",
    "plain-past",
    "plain-negative-past",
    "te-form",
];
const TE_IRU_OUTER_FORMS = [
    "polite-non-past",
    "polite-negative",
    "polite-past",
    "polite-negative-past",
    "plain-negative",
    "plain-past",
    "plain-negative-past",
];
const DERIVED_VERB_OUTER_FORMS = [
    ...DIRECT_VERB_FORMS,
    "te-iru",
];
const DESIRE_OUTER_FORMS = [
    "plain-negative",
    "plain-past",
    "plain-negative-past",
    "polite-non-past",
    "polite-negative",
    "polite-past",
];
const I_ADJECTIVE_FORMS = [
    "polite-non-past",
    "polite-negative",
    "polite-past",
    "polite-negative-past",
    "plain-negative",
    "plain-past",
    "plain-negative-past",
    "te-form",
];
const COPULA_FORMS = [
    "plain-non-past",
    "polite-non-past",
    "polite-negative",
    "polite-past",
    "polite-negative-past",
    "plain-negative",
    "plain-past",
    "plain-negative-past",
    "te-form",
];
function chainKey(transformations) {
    return transformations.join("\u0000");
}
function addChain(target, transformations) {
    target.add(chainKey(transformations));
}
function createSupportedVerbChains() {
    const supported = [[]];
    for (const form of DIRECT_VERB_FORMS)
        supported.push([form]);
    supported.push(["te-iru"], ["casual-te-iru"]);
    for (const outer of TE_IRU_OUTER_FORMS) {
        supported.push(["te-iru", outer]);
    }
    for (const derived of [
        "potential",
        "passive",
        "causative",
    ]) {
        supported.push([derived]);
        for (const outer of DERIVED_VERB_OUTER_FORMS) {
            supported.push([derived, outer]);
        }
    }
    supported.push(["desire"]);
    for (const outer of DESIRE_OUTER_FORMS) {
        supported.push(["desire", outer]);
    }
    for (const chain of [
        ["te-shimau"],
        ["te-shimau", "plain-past"],
        ["te-shimau", "polite-non-past"],
        ["te-shimau", "polite-past"],
        ["te-shimau", "casual-contraction"],
        ["te-shimau", "casual-contraction", "plain-past"],
        ["negative-conditional"],
        ["negative-conditional", "casual-contraction"],
    ]) {
        supported.push([...chain]);
    }
    return supported;
}
function createSingleFormPolicy(forms) {
    const supported = new Set();
    addChain(supported, []);
    for (const form of forms)
        addChain(supported, [form]);
    return supported;
}
exports.SUPPORTED_VERB_TRANSFORMATION_CHAINS = createSupportedVerbChains();
const VERB_POLICY = new Set(exports.SUPPORTED_VERB_TRANSFORMATION_CHAINS.map(chainKey));
const I_ADJECTIVE_POLICY = createSingleFormPolicy(I_ADJECTIVE_FORMS);
const COPULA_POLICY = createSingleFormPolicy(COPULA_FORMS);
const LEXICAL_POLICY = createSingleFormPolicy([]);
const FORM_CODE_SET = new Set(types_js_1.FORM_CODES);
function initialCategory(partOfSpeech) {
    if (partOfSpeech === "verb")
        return "verb";
    if (partOfSpeech === "i-adjective")
        return "i-adjective";
    if (partOfSpeech === "noun" || partOfSpeech === "na-adjective") {
        return "copula";
    }
    return "lexical";
}
function isVerbCategory(category) {
    return (category === "verb" ||
        category === "ichidan-derived-verb" ||
        category === "godan-u-derived-verb");
}
function nextCategory(category, transformation, previous) {
    if (transformation === "potential" ||
        transformation === "passive" ||
        transformation === "causative") {
        return isVerbCategory(category) ? "ichidan-derived-verb" : null;
    }
    if (transformation === "desire") {
        return isVerbCategory(category) ? "i-adjective-derived" : null;
    }
    if (transformation === "te-shimau") {
        return isVerbCategory(category) ? "godan-u-derived-verb" : null;
    }
    if (transformation === "te-iru") {
        return isVerbCategory(category) ? "ichidan-derived-verb" : null;
    }
    if (transformation === "casual-te-iru") {
        return isVerbCategory(category) ? "terminal" : null;
    }
    if (transformation === "negative-conditional") {
        return isVerbCategory(category)
            ? "negative-conditional-terminal"
            : null;
    }
    if (transformation === "casual-contraction") {
        if (category === "negative-conditional-terminal")
            return "terminal";
        if (category === "godan-u-derived-verb" && previous === "te-shimau") {
            return "godan-u-derived-verb";
        }
        return null;
    }
    if (transformation === "dictionary")
        return null;
    if (category === "terminal" || category === "negative-conditional-terminal") {
        return null;
    }
    if (category === "i-adjective" ||
        category === "i-adjective-derived") {
        return I_ADJECTIVE_FORMS.includes(transformation)
            ? "terminal"
            : null;
    }
    if (category === "copula") {
        return COPULA_FORMS.includes(transformation)
            ? "terminal"
            : null;
    }
    if (isVerbCategory(category)) {
        return DIRECT_VERB_FORMS.includes(transformation)
            ? "terminal"
            : null;
    }
    return null;
}
function categoryOrderIsValid(partOfSpeech, transformations) {
    let category = initialCategory(partOfSpeech);
    for (const [index, transformation] of transformations.entries()) {
        const next = nextCategory(category, transformation, transformations[index - 1]);
        if (!next)
            return false;
        category = next;
    }
    return true;
}
function policyForPartOfSpeech(partOfSpeech) {
    if (partOfSpeech === "verb")
        return VERB_POLICY;
    if (partOfSpeech === "i-adjective")
        return I_ADJECTIVE_POLICY;
    if (partOfSpeech === "noun" ||
        partOfSpeech === "na-adjective") {
        return COPULA_POLICY;
    }
    return LEXICAL_POLICY;
}
function isSupportedTransformationPattern(partOfSpeech, transformations) {
    return (policyForPartOfSpeech(partOfSpeech).has(chainKey(transformations)) &&
        categoryOrderIsValid(partOfSpeech, transformations));
}
/**
 * Returns whether the exact ordered chain is in the engine's supported
 * compositional subset for this lexical entry.
 */
function isSupportedTransformationChain(entry, transformations) {
    if (transformations.some((transformation) => !FORM_CODE_SET.has(transformation))) {
        return false;
    }
    if (transformations.length === 0)
        return true;
    const only = transformations.length === 1 ? transformations[0] : undefined;
    if (only && entry.formOverrides?.[only])
        return true;
    if (entry.partOfSpeech === "verb" &&
        entry.conjugationType === "aru" &&
        (transformations[0] === "potential" ||
            transformations[0] === "passive" ||
            transformations[0] === "causative")) {
        return false;
    }
    return (policyForPartOfSpeech(entry.partOfSpeech).has(chainKey(transformations)) &&
        categoryOrderIsValid(entry.partOfSpeech, transformations));
}
