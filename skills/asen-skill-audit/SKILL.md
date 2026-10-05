---
name: asen-skill-audit
description: "Trigger: audit skills, improve skills, normalize skill contracts. Audit safely while preserving intent and activation."
license: Apache-2.0
metadata:
  author: ASEN
  version: "1.0.0"
---
## Activation Contract
Activate for auditing, refactoring, normalizing, or improving an existing Skill contract. Default to audit-only. Do not modify files unless the user explicitly requests safe apply work. Read `docs/skill-style-guide.md` and use `.asen/skill-registry.md` as the exact project registry path.

## Hard Rules
- Preserve author intent, meaningful behavior, activation semantics, prohibitions, and output obligations.
- Audit exact frontmatter, kebab-case directory naming, trigger-first description, ordered sections, imperative rules, and local support paths.
- Check the 180–450 body-word target, 700 recommended ceiling, and 1000 hard maximum.
- Report ambiguity or conflict for human review instead of inventing triggers, policy, authority, or missing intent.
- Never modify in audit-only mode. Apply only explicitly requested, bounded, safe corrections.
- Move substantial rationale, examples, templates, schemas, or fixtures into local `references/` or `assets/`; do not silently delete meaningful material.
- Keep each `SKILL.md` authoritative. Recommend a registry refresh after creation, removal, movement, rename, or trigger changes.
- Do not infer behavioral parity from loading, structure, registry presence, or prose alone; require automated positive and negative evidence.

## Decision Gates
| Finding | Action |
| --- | --- |
| Metadata or section structure is invalid | Report the exact deterministic defect |
| Tutorial form or body budget hides rules | Recommend movement to the appropriate local support directory |
| Branching is hidden in prose | Report the gate and propose a compact decision row |
| Rule is ambiguous or conflicts with intent | Stop correction and record the ambiguity |
| Safe apply was explicitly requested | Correct only evidenced defects and preserve behavior |
| Runtime behavior changed | Recommend registry refresh and behavioral verification |

## Execution Steps
1. Read the normative guide, target Skill, local support files, and project registry when present.
2. Parse discovery metadata separately from strict conformance so old loadable Skills remain discoverable.
3. Audit metadata, naming, activation, rules, gates, steps, outputs, prohibitions, budget, and reference locality.
4. Classify findings by severity and distinguish deterministic defects from ambiguities.
5. If safe apply is authorized, preserve intent while making only bounded corrections and moving long material without loss.
6. Re-run strict audit and relevant behavior tests, then recommend registry refresh when indexing inputs changed.

## Output Contract
Return audited paths, severity-grouped findings, applied changes or explicit no-write status, preserved or moved assets and references, registry refresh recommendation, verification results, enforcement gaps, parity limits, and ambiguities requiring human review.

## References
- `docs/skill-style-guide.md` — normative ASEN Skill contract.
