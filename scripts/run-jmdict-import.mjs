// Keep the importer cross-platform while avoiding the TLS certificate mismatch
// currently presented by ftp.edrdg.org. The same EDRDG archive is available
// through the certificate-matching www.edrdg.org host.
process.env.JMDICT_URL ||= "https://www.edrdg.org/pub/Nihongo/JMdict_e.gz";

// JMdict rows can contain large precomputed search-form arrays. Supabase's
// PostgREST statement timeout can reject the import when the default 500-row
// upsert also has to maintain the GIN search_forms index. Use the importer's
// supported minimum batch size by default; callers can still override it.
process.env.JMDICT_BATCH_SIZE ||= "50";

await import("./import-jmdict.mjs");
