import type { Candidate, Evidence } from "../core/types.js";

export class EvidenceStore {
  readonly #items = new Map<string, Evidence>();

  add(candidate: Candidate, evidence: Omit<Evidence, "candidateId">): Evidence {
    const item: Evidence = { ...evidence, candidateId: candidate.id };
    this.#items.set(item.id, item);
    return item;
  }

  forCandidate(candidate: Candidate): Evidence[] {
    return [...this.#items.values()].filter((item) => item.candidateId === candidate.id);
  }

  hasPassing(candidate: Candidate, kind: Evidence["kind"]): boolean {
    return this.forCandidate(candidate).some((item) => item.kind === kind && item.status === "pass");
  }
}
