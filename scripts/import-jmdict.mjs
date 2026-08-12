import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import conjugationRuntime from "../lib/japanese-lexicon/runtime/conjugation.js";

const { generateEntryForms } = conjugationRuntime;

if (existsSync(".env.local") && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(".env.local");
}

const SOURCE_URL = process.env.JMDICT_URL?.trim() ||
  "https://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz";
const BATCH_SIZE = Math.max(50, Math.min(Number(process.env.JMDICT_BATCH_SIZE || 500), 1000));
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "JMdict import requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
  );
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const FUNCTION_POS = new Set([
  "prt", "aux", "aux-adj", "aux-v", "cop", "pref", "suf",
]);
const NOUN_POS = new Set([
  "n", "n-adv", "n-pr", "n-pref", "n-suf", "n-t", "pron", "num", "ctr",
]);
const ADVERB_POS = new Set(["adv", "adv-to"]);
const EXPRESSION_POS = new Set(["exp"]);
const I_ADJECTIVE_POS = new Set(["adj-i", "adj-ix"]);
const NA_ADJECTIVE_POS = new Set(["adj-na"]);
const VERB_TYPES = new Map([
  ["v1", "ichidan"], ["v1-s", "ichidan"],
  ["v5u", "godan-u"], ["v5u-s", "godan-u"],
  ["v5k", "godan-ku"], ["v5k-s", "godan-ku"],
  ["v5g", "godan-gu"], ["v5s", "godan-su"],
  ["v5t", "godan-tsu"], ["v5n", "godan-nu"],
  ["v5b", "godan-bu"], ["v5m", "godan-mu"],
  ["v5r", "godan-ru"], ["v5r-i", "godan-ru"],
  ["vs", "suru"], ["vs-i", "suru"], ["vs-s", "suru"],
  ["vk", "kuru"], ["v5aru", "aru"],
]);

function decodeXml(value) {
  return value
    .replace(/&#x([0-9a-f]+);/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .trim();
}

function tagBlocks(xml, tag) {
  const expression = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gu");
  return [...xml.matchAll(expression)].map((match) => match[1]);
}

function tagTexts(xml, tag) {
  return tagBlocks(xml, tag).map(decodeXml).filter(Boolean);
}

function entityCodes(xml, tag) {
  return tagBlocks(xml, tag).flatMap((value) =>
    [...value.matchAll(/&([A-Za-z0-9_-]+);/gu)].map((match) => match[1]),
  );
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function priorityScore(values) {
  let score = 0;
  for (const value of values) {
    if (["ichi1", "news1", "spec1", "gai1"].includes(value)) score = Math.max(score, 100);
    else if (["ichi2", "news2", "spec2", "gai2"].includes(value)) score = Math.max(score, 80);
    else {
      const nf = /^nf(\d{2})$/u.exec(value);
      if (nf) score = Math.max(score, Math.max(1, 70 - Number(nf[1])));
    }
  }
  return score;
}

function classifySense(posCodes, dictionaryForm) {
  if (posCodes.some((code) => FUNCTION_POS.has(code))) return null;
  for (const code of posCodes) {
    const conjugationType = dictionaryForm === "ある" ? "aru" : VERB_TYPES.get(code);
    if (conjugationType) return { partOfSpeech: "verb", conjugationType };
  }
  if (posCodes.some((code) => I_ADJECTIVE_POS.has(code))) {
    return { partOfSpeech: "i-adjective", conjugationType: null };
  }
  if (posCodes.some((code) => NA_ADJECTIVE_POS.has(code))) {
    return { partOfSpeech: "na-adjective", conjugationType: null };
  }
  if (posCodes.some((code) => ADVERB_POS.has(code))) {
    return { partOfSpeech: "adverb", conjugationType: null };
  }
  if (posCodes.some((code) => EXPRESSION_POS.has(code))) {
    return { partOfSpeech: "expression", conjugationType: null };
  }
  if (posCodes.some((code) => NOUN_POS.has(code))) {
    return { partOfSpeech: "noun", conjugationType: null };
  }
  return { partOfSpeech: "other", conjugationType: null };
}

function senseGroups(entryXml) {
  const groups = new Map();
  let inheritedPos = [];
  for (const sense of tagBlocks(entryXml, "sense")) {
    const explicitPos = entityCodes(sense, "pos");
    if (explicitPos.length > 0) inheritedPos = explicitPos;
    const glosses = unique(tagTexts(sense, "gloss")).slice(0, 6);
    if (glosses.length < 1 || inheritedPos.length < 1) continue;
    const key = inheritedPos.join("|");
    if (!groups.has(key)) groups.set(key, { posCodes: [...inheritedPos], glosses });
  }
  return [...groups.values()];
}

function kanjiElements(entryXml) {
  return tagBlocks(entryXml, "k_ele").map((block) => ({
    word: tagTexts(block, "keb")[0] || "",
    priorities: tagTexts(block, "ke_pri"),
  })).filter((item) => item.word);
}

function readingElements(entryXml) {
  return tagBlocks(entryXml, "r_ele").map((block) => ({
    reading: tagTexts(block, "reb")[0] || "",
    restrictions: tagTexts(block, "re_restr"),
    noKanji: /<re_nokanji\s*\/?\s*>/u.test(block),
    priorities: tagTexts(block, "re_pri"),
  })).filter((item) => item.reading);
}

function containsKanji(value) {
  return /\p{Script=Han}/u.test(value);
}

function searchFormsFor(spellings, reading, partOfSpeech, conjugationType) {
  const forms = new Set([reading, ...spellings]);
  for (const spelling of spellings) {
    const entry = {
      id: "jmdict-import",
      kanji: containsKanji(spelling) ? spelling : "",
      kana: reading,
      meaning: "",
      partOfSpeech,
      ...(conjugationType ? { conjugationType } : {}),
      aliases: [],
      source: "migration",
      createdAt: "1970-01-01T00:00:00.000Z",
      updatedAt: "1970-01-01T00:00:00.000Z",
    };
    try {
      for (const form of generateEntryForms(entry)) {
        if (form?.surface) forms.add(form.surface);
        if (form?.kana) forms.add(form.kana);
      }
    } catch {
      // JMdict contains a few historical/irregular classes outside AIko's
      // supported conjugation contract. Their dictionary form remains usable.
    }
  }
  return [...forms].map((value) => value.normalize("NFKC").trim()).filter(Boolean);
}

function entryRows(entryXml, sourceVersion) {
  const entrySeq = Number(tagTexts(entryXml, "ent_seq")[0]);
  if (!Number.isFinite(entrySeq)) return [];
  const kanji = kanjiElements(entryXml);
  const readings = readingElements(entryXml);
  const senses = senseGroups(entryXml);
  if (readings.length < 1 || senses.length < 1) return [];

  const rows = [];
  for (const reading of readings) {
    const allowedKanji = reading.noKanji
      ? []
      : kanji.filter((item) =>
          reading.restrictions.length < 1 || reading.restrictions.includes(item.word),
        );
    const rankedSpellings = [...allowedKanji].sort(
      (left, right) => priorityScore(right.priorities) - priorityScore(left.priorities),
    );
    const primary = rankedSpellings[0]?.word || reading.reading;
    const aliases = unique(rankedSpellings.slice(1).map((item) => item.word));
    const spellingPriority = Math.max(
      priorityScore(reading.priorities),
      ...rankedSpellings.map((item) => priorityScore(item.priorities)),
      0,
    );

    for (const sense of senses) {
      const classification = classifySense(sense.posCodes, primary);
      if (!classification) continue;
      if (classification.partOfSpeech === "verb" && !classification.conjugationType) continue;

      const spellings = unique([primary, ...aliases]);
      const searchForms = searchFormsFor(
        spellings,
        reading.reading,
        classification.partOfSpeech,
        classification.conjugationType,
      );
      const identity = [
        entrySeq,
        primary,
        reading.reading,
        classification.partOfSpeech,
        classification.conjugationType || "",
      ].join("\u001f");
      const entryKey = `${entrySeq}:${createHash("sha1").update(identity).digest("hex").slice(0, 16)}`;
      rows.push({
        entry_key: entryKey,
        entry_seq: entrySeq,
        dictionary_form: primary,
        reading: reading.reading,
        meaning: sense.glosses[0],
        meanings: sense.glosses,
        part_of_speech: classification.partOfSpeech,
        conjugation_type: classification.conjugationType,
        aliases,
        search_forms: searchForms,
        common: spellingPriority > 0,
        priority: spellingPriority,
        source_version: sourceVersion,
        imported_at: new Date().toISOString(),
      });
    }
  }
  return rows;
}

async function* streamEntries(gzipStream) {
  let buffer = "";
  for await (const chunk of gzipStream) {
    buffer += chunk.toString("utf8");
    while (true) {
      const start = buffer.indexOf("<entry>");
      if (start < 0) {
        if (buffer.length > 1_000_000) buffer = buffer.slice(-200_000);
        break;
      }
      const end = buffer.indexOf("</entry>", start);
      if (end < 0) {
        if (start > 0) buffer = buffer.slice(start);
        break;
      }
      const endOffset = end + "</entry>".length;
      yield buffer.slice(start, endOffset);
      buffer = buffer.slice(endOffset);
    }
  }
}

async function flush(rows) {
  if (rows.length < 1) return;
  const result = await supabase
    .from("jmdict_entries")
    .upsert(rows, { onConflict: "entry_key" });
  if (result.error) throw new Error(`JMdict batch write failed: ${result.error.message}`);
}

console.log(`Downloading JMdict from ${SOURCE_URL}`);
const response = await fetch(SOURCE_URL, {
  headers: { accept: "application/gzip, application/octet-stream" },
});
if (!response.ok || !response.body) {
  throw new Error(`JMdict download failed with status ${response.status}.`);
}

const lastModified = response.headers.get("last-modified")?.trim();
const etag = response.headers.get("etag")?.replaceAll('"', "").trim();
const sourceVersion = `JMdict_e:${etag || lastModified || new Date().toISOString()}`;
const gunzip = Readable.fromWeb(response.body).pipe(createGunzip());

let batch = [];
let xmlEntries = 0;
let storedRows = 0;
for await (const entryXml of streamEntries(gunzip)) {
  xmlEntries += 1;
  const rows = entryRows(entryXml, sourceVersion);
  batch.push(...rows);
  storedRows += rows.length;
  if (batch.length >= BATCH_SIZE) {
    await flush(batch);
    batch = [];
    if (xmlEntries % 5000 < 20) {
      console.log(`Parsed ${xmlEntries.toLocaleString()} entries; staged ${storedRows.toLocaleString()} rows.`);
    }
  }
}
await flush(batch);

if (storedRows < 10_000) {
  throw new Error(`JMdict import produced only ${storedRows} usable rows; refusing to finalize.`);
}

const finalized = await supabase.rpc("finalize_jmdict_import", {
  p_source_version: sourceVersion,
  p_source_url: SOURCE_URL,
  p_entry_count: storedRows,
});
if (finalized.error) {
  throw new Error(`JMdict import finalization failed: ${finalized.error.message}`);
}

console.log(JSON.stringify({
  sourceVersion,
  xmlEntries,
  storedRows,
  finalized: finalized.data,
}, null, 2));
