import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const CACHE_DIR = process.env.JMDICT_CACHE_DIR?.trim() || join(homedir(), ".cache", "aiko-jmdict");
const META_PATH = process.env.JMDICT_COMPACT_META?.trim() || join(CACHE_DIR, "jmdict_compact_metadata.json");
const DB_URL = process.env.SUPABASE_DB_URL?.trim();

if (!DB_URL) {
  throw new Error(
    "JMdict bulk load requires SUPABASE_DB_URL. Use the Postgres connection string from Supabase Connect; do not commit it to the repository.",
  );
}
if (!existsSync(META_PATH)) {
  throw new Error(`Compact JMdict metadata not found at ${META_PATH}. Run npm run jmdict:compact first.`);
}

const psqlCheck = spawnSync("psql", ["--version"], { encoding: "utf8" });
if (psqlCheck.error || psqlCheck.status !== 0) {
  throw new Error("psql is required for the bulk JMdict load but is not available in this environment.");
}

const metadata = JSON.parse(await readFile(META_PATH, "utf8"));
const csvPath = String(metadata.csvPath || "");
if (!csvPath || !existsSync(csvPath)) {
  throw new Error(`Compact JMdict CSV not found at ${csvPath || "<missing path>"}.`);
}
if (!Number.isFinite(Number(metadata.storedRows)) || Number(metadata.storedRows) < 10_000) {
  throw new Error("Compact JMdict metadata has an invalid row count.");
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
function copyPathLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const sqlPath = join(CACHE_DIR, "load-jmdict.sql");
const copyColumns = [
  "entry_key",
  "entry_seq",
  "dictionary_form",
  "reading",
  "meaning",
  "meanings",
  "part_of_speech",
  "conjugation_type",
  "aliases",
  "common",
  "priority",
  "source_version",
  "imported_at",
].join(", ");

// psql backslash commands terminate at the newline. Keep the entire \copy
// command on one physical line; SQL statements below may remain multiline.
const copyCommand = `\\copy public.jmdict_entries (${copyColumns}) from ${copyPathLiteral(csvPath)} with (format csv, header true, encoding 'UTF8');`;

const sql = String.raw`\set ON_ERROR_STOP on
\echo 'Starting compact JMdict bulk load...'
set statement_timeout = 0;
set lock_timeout = 0;
begin;
set local synchronous_commit = off;

truncate table public.jmdict_entries;
truncate table public.jmdict_import_state;

drop index if exists public.jmdict_entries_entry_seq_idx;
drop index if exists public.jmdict_entries_dictionary_form_idx;
drop index if exists public.jmdict_entries_reading_idx;
drop index if exists public.jmdict_entries_aliases_idx;

${copyCommand}

create index jmdict_entries_entry_seq_idx
  on public.jmdict_entries (entry_seq);
create index jmdict_entries_dictionary_form_idx
  on public.jmdict_entries (dictionary_form);
create index jmdict_entries_reading_idx
  on public.jmdict_entries (reading);
create index jmdict_entries_aliases_idx
  on public.jmdict_entries using gin (aliases);

insert into public.jmdict_import_state (
  singleton, source_version, source_url, entry_count, imported_at
) values (
  true,
  ${sqlLiteral(metadata.sourceVersion)},
  ${sqlLiteral(metadata.sourceUrl)},
  ${Number(metadata.storedRows)},
  now()
)
on conflict (singleton) do update
set source_version = excluded.source_version,
    source_url = excluded.source_url,
    entry_count = excluded.entry_count,
    imported_at = excluded.imported_at;

analyze public.jmdict_entries;
commit;

\echo 'Compact JMdict bulk load completed.'
select count(*) as jmdict_rows from public.jmdict_entries;
select pg_size_pretty(pg_total_relation_size('public.jmdict_entries')) as jmdict_total_size;
`;
await writeFile(sqlPath, sql, "utf8");

console.log(`Loading ${Number(metadata.storedRows).toLocaleString()} compact JMdict rows with psql.`);
console.log(`CSV: ${csvPath}`);

const child = spawn("psql", [DB_URL, "-f", sqlPath], {
  stdio: "inherit",
  env: process.env,
});
const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code) => resolve(code ?? 1));
});
if (exitCode !== 0) {
  throw new Error(`JMdict bulk load failed with psql exit code ${exitCode}.`);
}
