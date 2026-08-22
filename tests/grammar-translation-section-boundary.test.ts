import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260822032857_split_grammar_translation_sections.sql",
  "utf8",
);

describe("Grammar and Translation durable section boundary", () => {
  it("orders Translation after Grammar in every phase-atomic RPC", () => {
    expect(migration).toContain(
      "'story','vocabulary','grammar','translation','reading','listening','speaking'",
    );
    expect(migration).toContain("p_phase = 'grammar'");
    expect(migration).toContain("p_phase not in ('grammar', 'translation')");
    expect(migration).toContain(
      "Translation section requires exactly 5 validated answers",
    );
  });

  it("preserves Grammar while restarting an incomplete Translation section", () => {
    expect(migration).toContain("v_index = 3");
    expect(migration).toContain("where not (answer ? 'validationSource')");
    expect(migration).toContain("a.phase = 'grammar_translation'");
  });

  it("requires seven completed-or-skipped section ledger rows", () => {
    expect(migration).toContain(") <> 7 then");
    expect(migration).toContain("commit.phase = ''translation''");
    expect(migration).toContain("cardinality(v_completed) = 7");
  });
});
