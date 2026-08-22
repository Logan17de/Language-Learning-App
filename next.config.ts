import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The server-side custom lesson worker reads the manually curated JLPT CSVs
  // at runtime. Include them explicitly in Vercel/Next output tracing.
  outputFileTracingIncludes: {
    "/*": ["./Vocabs/**/*.csv"],
    // kuromoji loads its dictionary from disk at runtime. Without these the
    // files are not traced into the deployed function and every romaji hint
    // and pronunciation score fails in production while passing locally.
    "/api/audio/transcribe": ["./node_modules/kuromoji/dict/**"],
    "/api/audio/reading": ["./node_modules/kuromoji/dict/**"],
  },
};

export default nextConfig;
