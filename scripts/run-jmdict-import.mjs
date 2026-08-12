// Keep the importer cross-platform while avoiding the TLS certificate mismatch
// currently presented by ftp.edrdg.org. The same EDRDG archive is available
// through the certificate-matching www.edrdg.org host.
process.env.JMDICT_URL ||= "https://www.edrdg.org/pub/Nihongo/JMdict_e.gz";

await import("./import-jmdict.mjs");
