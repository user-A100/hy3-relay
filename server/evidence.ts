import type { RelayAnalysis } from "../shared/contracts.js";

export function verifyEvidence(
  analysis: RelayAnalysis,
  materials: Array<{ name: string; content: string }>,
): { verified: number; unverified: number } {
  let verified = 0;
  let unverified = 0;

  const materialByName = new Map(
    materials.map((material) => [material.name, normalize(material.content)]),
  );

  for (const fact of analysis.facts) {
    const source = materialByName.get(fact.source);
    if (source?.includes(normalize(fact.evidence))) {
      verified += 1;
    } else {
      unverified += 1;
    }
  }

  return { verified, unverified };
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
