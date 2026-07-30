/* eslint-disable */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pendingIdentity = pendingIdentity;
const normalize_js_1 = require("./normalize.js");
/**
 * Identifies an unresolved lexical item without collapsing Japanese
 * homographs that share a visible surface.
 */
function pendingIdentity(surface, hints = {}) {
    return [
        (0, normalize_js_1.normalizeJapanese)(surface),
        (0, normalize_js_1.normalizeJapanese)(hints.dictionaryForm),
        hints.partOfSpeech ?? "",
        hints.conjugationType ?? "",
    ].join("\u0000");
}
