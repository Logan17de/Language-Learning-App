import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { once } from "node:events";

const CACHE_DIR = process.env.JMDICT_CACHE_DIR?.trim() || join(homedir(), ".cache", "aiko-jmdict");
const INPUT_CSV = process.env.JMDICT_PREPARED_CSV?.trim() || join(CACHE_DIR, "jmdict_entries.csv");
const INPUT_META = process.env.JMDICT_PREPARED_META?.trim() || join(CACHE_DIR, "jmdict_metadata.json");
const OUTPUT_CSV = process.env.JMDICT_COMPACT_CSV?.trim() || join(CACHE_DIR, "jmdict_compact.csv");
const OUTPUT_META = process.env.JMDICT_COMPACT_META?.trim() || join(CACHE_DIR, "jmdict_compact_metadata.json");
const SEARCH_FORMS_INDEX = 9;

if (!existsSync(INPUT_CSV) || !existsSync(INPUT_META)) {
  throw new Error(
    `Prepared JMdict files are missing. Expected ${INPUT_CSV} and ${INPUT_META}. Run npm run jmdict:prepare first.`,
  );
}

function splitCsvRecord(line) {
  const fields = [];
  let start = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        index += 1;
        continue;
      }
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      fields.push(line.slice(start, index));
      start = index + 1;
    }
  }
  fields.push(line.slice(start));
  return fields;
}

const sourceMeta = JSON.parse(await readFile(INPUT_META, "utf8"));
const output = createWriteStream(OUTPUT_CSV, { encoding: "utf8" });
const input = createInterface({
  input: createReadStream(INPUT_CSV, { encoding: "utf8" }),
  crlfDelay: Infinity,
});

let lineNumber = 0;
let rows = 0;
console.log(`Compacting prepared JMdict CSV ${INPUT_CSV}`);
for await (const line of input) {
  lineNumber += 1;
  if (!line) continue;
  const fields = splitCsvRecord(line);
  if (fields.length !== 14) {
    throw new Error(`Unexpected JMdict CSV shape at line ${lineNumber}: expected 14 columns, got ${fields.length}.`);
  }
  fields.splice(SEARCH_FORMS_INDEX, 1);
  if (!output.write(`${fields.join(",")}\n`)) await once(output, "drain");
  if (lineNumber > 1) rows += 1;
  if (rows > 0 && rows % 50_000 === 0) {
    console.log(`Compacted ${rows.toLocaleString()} rows.`);
  }
}
output.end();
await once(output, "finish");

if (rows !== Number(sourceMeta.storedRows)) {
  throw new Error(`Compact row count mismatch: expected ${sourceMeta.storedRows}, wrote ${rows}.`);
}

const outputStat = await stat(OUTPUT_CSV);
const metadata = {
  ...sourceMeta,
  originalCsvPath: sourceMeta.csvPath,
  originalCsvBytes: sourceMeta.csvBytes,
  csvPath: OUTPUT_CSV,
  csvBytes: outputStat.size,
  storedRows: rows,
  compact: true,
  omittedColumns: ["search_forms"],
  compactedAt: new Date().toISOString(),
};
await writeFile(OUTPUT_META, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
console.log(JSON.stringify(metadata, null, 2));
