import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The server-side custom lesson worker reads the manually curated JLPT CSVs
  // at runtime. Include them explicitly in Vercel/Next output tracing.
  outputFileTracingIncludes: {
    "/*": ["./Vocabs/**/*.csv"],
  },
};

export default nextConfig;
