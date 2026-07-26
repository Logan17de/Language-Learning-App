import type { InspectableTerm } from "@/lib/gemini/lesson-types";

export interface InspectableTermLookup {
  byId: Map<string, InspectableTerm>;
  byReading: Map<string, InspectableTerm>;
  bySurface: Map<string, InspectableTerm>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function createInspectableTermLookup(
  terms: InspectableTerm[],
): InspectableTermLookup {
  const lookup: InspectableTermLookup = {
    byId: new Map<string, InspectableTerm>(),
    byReading: new Map<string, InspectableTerm>(),
    bySurface: new Map<string, InspectableTerm>(),
  };
  for (const term of terms) {
    lookup.byId.set(term.libraryId, term);
    if (!lookup.bySurface.has(term.surface)) lookup.bySurface.set(term.surface, term);
    if (term.reading && !lookup.byReading.has(term.reading)) {
      lookup.byReading.set(term.reading, term);
    }
  }
  return lookup;
}

export function resolveInspectableTerm(
  value: unknown,
  lookup: InspectableTermLookup,
): InspectableTerm | null {
  if (!isRecord(value)) return null;
  const libraryId = typeof value.libraryId === "string" ? value.libraryId.trim() : "";
  const surface = typeof value.surface === "string" ? value.surface.trim() : "";
  const reading = typeof value.reading === "string" ? value.reading.trim() : "";
  const canonical = (libraryId ? lookup.byId.get(libraryId) : undefined)
    ?? (surface ? lookup.bySurface.get(surface) : undefined)
    ?? (reading ? lookup.byReading.get(reading) : undefined);
  if (!canonical) return null;
  return {
    ...canonical,
    surface: surface || canonical.surface,
  };
}
