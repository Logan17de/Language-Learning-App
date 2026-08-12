import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { once } from "node:events";
import { createGunzip } from "node:zlib";
import conjugationRuntime from "../lib/japanese-lexicon/runtime/conjugation.js";

const { buildVerbStems, generateEntryForms } = conjugationRuntime;

const CACHE_DIR = process.env.JMDICT_CACHE_DIR?.trim() || join(homedir(), ".cache", "aiko-jmdict");
const INPUT_GZ = process.env.JMDICT_INPUT_GZ?.trim() || join(CACHE_DIR, "JMdict_e.gz");
const OUTPUT_CSV = process.env.JMDICT_OUTPUT_CSV?.trim() || join(CACHE_DIR, "jmdict_entries.csv");
const OUTPUT_META = process.env.JMDICT_OUTPUT_META?.trim() || join(CACHE_DIR, "jmdict_metadata.json");
const SOURCE_URL = "https://www.edrdg.org/pub/Nihongo/JMdict_e.gz";

if (!existsSync(INPUT_GZ)) {
  throw new Error(`JMdict archive not found at ${INPUT_GZ}. Download it before running jmdict:prepare.`);
}

const FUNCTION_POS = new Set(["prt", "aux", "aux-adj", "aux-v", "cop", "pref", "suf"]);
const NOUN_POS = new Set(["n", "n-adv", "n-pr", "n-pref", "n-suf", "n-t", "pron", "num", "ctr"]);
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
  if (posCodes.some((code) => I_ADJECTIVE_POS.has(code))) return { partOfSpeech: "i-adjective", conjugationType: null };
  if (posCodes.some((code) => NA_ADJECTIVE_POS.has(code))) return { partOfSpeech: "na-adjective", conjugationType: null };
  if (posCodes.some((code) => ADVERB_POS.has(code))) return { partOfSpeech: "adverb", conjugationType: null };
  if (posCodes.some((code) => EXPRESSION_POS.has(code))) return { partOfSpeech: "expression", conjugationType: null };
  if (posCodes.some((code) => NOUN_POS.has(code))) return { partOfSpeech: "noun", conjugationType: null };
  return { partOfSpeech: "other", conjugationType: null };
}

function senseGroups(entryXml) {
  const groups = [];
  let inheritedPos = [];
  for (const sense of tagBlocks(entryXml, "sense")) {
    const explicitPos = entityCodes(sense, "pos");
    if (explicitPos.length > 0) inheritedPos = explicitPos;
    const glosses = unique(tagTexts(sense, "gloss")).slice(0, 6);
    if (glosses.length > 0 && inheritedPos.length > 0) groups.push({ posCodes: [...inheritedPos], glosses });
  }
  return groups;
}

function kanjiElements(entryXml) {
  return tagBlocks(entryXml, "k_ele")
    .map((block) => ({ word: tagTexts(block, "keb")[0] || "", priorities: tagTexts(block, "ke_pri") }))
    .filter((item) => item.word);
}

function readingElements(entryXml) {
  return tagBlocks(entryXml, "r_ele")
    .map((block) => ({
      reading: tagTexts(block, "reb")[0] || "",
      restrictions: tagTexts(block, "re_restr"),
      noKanji: /<re_nokanji\s*\/?\s*>/u.test(block),
      priorities: tagTexts(block, "re_pri"),
    }))
    .filter((item) => item.reading);
}

function containsKanji(value) {
  return /\p{Script=Han}/u.test(value);
}

function replaceEnding(value, ending, replacement) {
  return value.endsWith(ending) ? value.slice(0, -ending.length) + replacement : null;
}

function temporaryEntry(spelling, reading, partOfSpeech, conjugationType) {
  return {
    id: "jmdict-prepare",
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
}

function addEntryForms(forms, entry) {
  try {
    for (const form of generateEntryForms(entry)) {
      if (form?.surface) forms.add(form.surface);
      if (form?.kana) forms.add(form.kana);
    }
  } catch {
    // Preserve canonical data even when an unusual historical form is outside
    // the app's supported conjugation engine.
  }
}

function derivedVerbEntries(entry) {
  if (entry.partOfSpeech !== "verb" || !entry.conjugationType) return [];
  let stems;
  try {
    stems = buildVerbStems(entry);
  } catch {
    return [];
  }

  const result = [];
  const type = entry.conjugationType;
  if (type !== "aru") {
    const potentialSurface = `${stems.potentialStemSurface}る`;
    const potentialKana = `${stems.potentialStemKana}る`;
    result.push(temporaryEntry(potentialSurface, potentialKana, "verb", "ichidan"));

    let passiveSurface;
    let passiveKana;
    if (type === "ichidan" || type === "kuru") {
      passiveSurface = potentialSurface;
      passiveKana = potentialKana;
    } else if (type === "suru") {
      passiveSurface = replaceEnding(stems.dictionarySurface, "する", "される");
      passiveKana = replaceEnding(stems.dictionaryKana, "する", "される");
    } else {
      passiveSurface = `${stems.negativeStemSurface}れる`;
      passiveKana = `${stems.negativeStemKana}れる`;
    }
    if (passiveSurface && passiveKana) result.push(temporaryEntry(passiveSurface, passiveKana, "verb", "ichidan"));

    let causativeSurface;
    let causativeKana;
    if (type === "ichidan") {
      causativeSurface = replaceEnding(stems.dictionarySurface, "る", "させる");
      causativeKana = replaceEnding(stems.dictionaryKana, "る", "させる");
    } else if (type === "suru") {
      causativeSurface = replaceEnding(stems.dictionarySurface, "する", "させる");
      causativeKana = replaceEnding(stems.dictionaryKana, "する", "させる");
    } else if (type === "kuru") {
      causativeSurface = `${stems.negativeStemSurface}させる`;
      causativeKana = `${stems.negativeStemKana}させる`;
    } else {
      causativeSurface = `${stems.negativeStemSurface}せる`;
      causativeKana = `${stems.negativeStemKana}せる`;
    }
    if (causativeSurface && causativeKana) result.push(temporaryEntry(causativeSurface, causativeKana, "verb", "ichidan"));
  }

  result.push(temporaryEntry(`${stems.politeStemSurface}たい`, `${stems.politeStemKana}たい`, "i-adjective", null));
  result.push(temporaryEntry(`${stems.teSurface}しまう`, `${stems.teKana}しまう`, "verb", "godan-u"));
  return result;
}

function searchFormsFor(spellings, reading, partOfSpeech, conjugationType) {
  const forms = new Set([reading, ...spellings]);
  for (const spelling of spellings) {
    const entry = temporaryEntry(spelling, reading, partOfSpeech, conjugationType);
    addEntryForms(forms, entry);
    for (const derived of derivedVerbEntries(entry)) addEntryForms(forms, derived);

    if (partOfSpeech === "verb" && conjugationType) {
      try {
        const stems = buildVerbStems(entry);
        const conditional = conjugationType === "aru" ? "なければ" : `${stems.negativeStemSurface}なければ`;
        forms.add(conditional);
        if (conditional.endsWith("なければ")) forms.add(`${conditional.slice(0, -"なければ".length)}なきゃ`);
        const te = stems.teSurface;
        if (te.endsWith("て")) {
          const base = te.slice(0, -1);
          forms.add(`${base}ちゃう`);
          forms.add(`${base}ちゃった`);
        } else if (te.endsWith("で")) {
          const base = te.slice(0, -1);
          forms.add(`${base}じゃう`);
          forms.add(`${base}じゃった`);
        }
      } catch {
        // Canonical and basic generated forms remain available.
      }
    }
  }
  return [...forms].map((value) => value.normalize("NFKC").trim()).filter(Boolean);
}

function entryRows(entryXml, sourceVersion, importedAt) {
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
      : kanji.filter((item) => reading.restrictions.length < 1 || reading.restrictions.includes(item.word));
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

    const classified = new Map();
    for (const sense of senses) {
      const classification = classifySense(sense.posCodes, primary);
      if (!classification) continue;
      const classKey = `${classification.partOfSpeech}:${classification.conjugationType || ""}`;
      const current = classified.get(classKey);
      if (current) current.glosses = unique([...current.glosses, ...sense.glosses]).slice(0, 6);
      else classified.set(classKey, { ...classification, glosses: [...sense.glosses] });
    }

    for (const group of classified.values()) {
      const spellings = unique([primary, ...aliases]);
      const identity = [entrySeq, primary, reading.reading, group.partOfSpeech, group.conjugationType || ""].join("\u001f");
      rows.push({
        entry_key: `${entrySeq}:${createHash("sha1").update(identity).digest("hex").slice(0, 16)}`,
        entry_seq: entrySeq,
        dictionary_form: primary,
        reading: reading.reading,
        meaning: group.glosses[0],
        meanings: group.glosses,
        part_of_speech: group.partOfSpeech,
        conjugation_type: group.conjugationType,
        aliases,
        search_forms: searchFormsFor(spellings, reading.reading, group.partOfSpeech, group.conjugationType),
        common: spellingPriority > 0,
        priority: spellingPriority,
        source_version: sourceVersion,
        imported_at: importedAt,
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

function postgresArray(values) {
  return `{${values.map((value) => `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`).join(",")}}`;
}

function csvField(value) {
  if (value === null || value === undefined) return "";
  return `"${String(value).replaceAll('"', '""')}"`;
}

function csvRow(row) {
  return [
    row.entry_key,
    row.entry_seq,
    row.dictionary_form,
    row.reading,
    row.meaning,
    postgresArray(row.meanings),
    row.part_of_speech,
    row.conjugation_type,
    postgresArray(row.aliases),
    postgresArray(row.search_forms),
    row.common,
    row.priority,
    row.source_version,
    row.imported_at,
  ].map(csvField).join(",") + "\n";
}

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

await mkdir(dirname(OUTPUT_CSV), { recursive: true });
const archiveStat = await stat(INPUT_GZ);
const archiveSha256 = await sha256File(INPUT_GZ);
const sourceVersion = `JMdict_e:sha256:${archiveSha256}`;
const importedAt = new Date().toISOString();

const output = createWriteStream(OUTPUT_CSV, { encoding: "utf8" });
output.write([
  "entry_key", "entry_seq", "dictionary_form", "reading", "meaning", "meanings",
  "part_of_speech", "conjugation_type", "aliases", "search_forms", "common", "priority",
  "source_version", "imported_at",
].join(",") + "\n");

console.log(`Preparing local JMdict bulk file from ${INPUT_GZ}`);
let xmlEntries = 0;
let storedRows = 0;
const gunzip = createReadStream(INPUT_GZ).pipe(createGunzip());
for await (const entryXml of streamEntries(gunzip)) {
  xmlEntries += 1;
  const rows = entryRows(entryXml, sourceVersion, importedAt);
  for (const row of rows) {
    storedRows += 1;
    if (!output.write(csvRow(row))) await once(output, "drain");
  }
  if (xmlEntries % 25_000 === 0) {
    console.log(`Parsed ${xmlEntries.toLocaleString()} XML entries; wrote ${storedRows.toLocaleString()} rows.`);
  }
}
output.end();
await once(output, "finish");

if (storedRows < 10_000) {
  throw new Error(`JMdict preparation produced only ${storedRows} usable rows.`);
}

const outputStat = await stat(OUTPUT_CSV);
const metadata = {
  sourceUrl: SOURCE_URL,
  sourceVersion,
  archivePath: INPUT_GZ,
  archiveBytes: archiveStat.size,
  archiveSha256,
  csvPath: OUTPUT_CSV,
  csvBytes: outputStat.size,
  xmlEntries,
  storedRows,
  preparedAt: importedAt,
};
await writeFile(OUTPUT_META, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

console.log(JSON.stringify(metadata, null, 2));