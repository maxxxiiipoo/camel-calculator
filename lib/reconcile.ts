import type { TraitObservation, VisualObservation } from "./config.ts";

function choose(values: TraitObservation[]) {
  const visible = values.filter((v) => v.value !== "not_visible" && v.value !== "unknown");
  if (!visible.length) return values[0];
  return [...visible].sort((a, b) => b.confidence - a.confidence)[0];
}

export function reconcileObservations(items: VisualObservation[]): VisualObservation {
  if (!items.length) throw new Error("No observations");
  const base = structuredClone(items[0]);
  for (const section of ["face", "hair", "physique", "style"] as const) {
    for (const key of Object.keys(base[section])) {
      const values = items.map((item) => item[section][key as never]) as TraitObservation[];
      (base[section] as Record<string, TraitObservation>)[key] = choose(values);
    }
  }
  const conflicts: string[] = [];
  for (const section of ["face", "hair", "physique", "style"] as const) {
    for (const key of Object.keys(base[section])) {
      const confident = items.map((i) => i[section][key as never] as TraitObservation).filter((v) => v.confidence >= 0.72 && !["unknown", "not_visible"].includes(v.value));
      if (new Set(confident.map((v) => v.value)).size > 1) conflicts.push(`${section}.${key}`);
    }
  }
  base.evidence = {
    ...base.evidence,
    usableViews: items.length,
    overallConfidence: items.reduce((sum, i) => sum + i.evidence.overallConfidence, 0) / items.length,
    faceCoverage: Math.max(...items.map((i) => i.evidence.faceCoverage)),
    bodyCoverage: Math.max(...items.map((i) => i.evidence.bodyCoverage)),
    missingTraits: Array.from(new Set(items.flatMap((i) => i.evidence.missingTraits))).filter((name) => !conflicts.includes(name)),
  };
  if (conflicts.length > 3) base.evidence.overallConfidence = Math.min(base.evidence.overallConfidence, 0.5);
  return base;
}
