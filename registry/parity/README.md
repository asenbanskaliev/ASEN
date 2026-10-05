# ASEN External ecosystem parity audit

This registry measures observable capability parity. It does not measure file count or source-code similarity.

Baselines:
- ASEN: `3c76ed7aa9be124288397ca8baf35ceacfe5889c`
- Reference A: `fe61793e7cb3e75462ba53c7631e87d78e989354`
- Reference B: `a9e36e9b8a4d7885244466cd9ea6cc3ad330a69b`
- Reference C: `618e30f68f0f2e3b736df91fcfbaaad279ccd3d2`

## Strict Skill contract baseline

`skill-sources-v1.json` freezes one exact repository commit by byte SHA-256. It contains all 12 source `SKILL.md` documents, their present local support contracts, and the support contract that is explicitly absent at that baseline. The manifest records provenance and hashes only; it does not copy source text.

`skill-contract-parity-v1.json` is the strict 12/12 behavioral matrix. Every row maps one manifest source ID to an ASEN Skill and declares nonempty activation, hard-rule, decision-gate, output, and prohibited-behavior contract IDs. Every gap and equivalent adaptation points to a declared contract. The initial baseline is deliberately non-final: 11 rows are `PARTIAL`, and the registry row is `MISSING` until its runtime behavior exists.

Statuses: `FULL`, `PARTIAL`, `MISSING`.

Run `npm run audit:skill-parity` to validate the checked-in manifest, matrix, mapped Skills, evidence paths, registry boundary, and `CAP-SKL-001` status without reading the external source repository. Mutation tests cover invalid claims and references.

Rules:
1. `FULL` requires observable ASEN behavior plus automated positive and negative evidence; structure, loading, or file presence is insufficient.
2. `PARTIAL` means the core mapping exists but relevant observable behavior or evidence is missing.
3. `MISSING` means useful in-scope behavior has no ASEN implementation and evidence.
4. No external runtime dependency or source copying is permitted.
5. Every remediation must preserve Pi as the execution, model, authentication, and session platform.
6. The project Skill index path is `.asen/skill-registry.md`.
