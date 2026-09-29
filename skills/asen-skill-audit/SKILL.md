---
name: asen-skill-audit
description: "Trigger: audit skills, improve skills, skill quality. Audit Pi-native skills for activation clarity, executable gates, preserved intent and registry consistency."
---
## Activation Contract
Use when reviewing or improving existing skill contracts.
## Hard Rules
- Read and enforce `docs/skill-style-guide.md` as the normative contract.
- Preserve meaningful behavior, activation semantics and author intent.
- Default to audit-only unless modification is authorized.
- Do not invent triggers or policy to make a Skill look complete.
- Audit exact frontmatter, ordered sections, imperative rules, local support files, explicit prohibitions, the 180–450 body-token target and 1000-token hard maximum.
- Use `.asen/skill-registry.md` as the project index; keep each `SKILL.md` authoritative.
- Never claim FULL behavioral parity from structure, loading or file presence; require automated positive and negative evidence.
- Move explanation/examples into local `references/` or `assets/` instead of silently deleting meaningful content.
## Decision Gates
| Situation | Action |
| --- | --- |
| Invalid metadata/sections | Correct structural defect |
| Rule is ambiguous/conflicting | Report for decision |
| Runtime rule lacks executable enforcement | Recommend/add gate when authorized |
## Execution Steps
1. Read the style guide, `.asen/skill-registry.md` when present and the exact `SKILL.md`.
2. Audit frontmatter, activation, hard rules, gates, execution, outputs, prohibitions, budget and local references.
3. Compare with executable enforcement/tests.
4. Apply only authorized safe improvements.
5. Refresh registry and re-run audits.
## Output Contract
Return skills audited, defects by severity, changes, enforcement gaps and unresolved decisions.
## References
- `docs/skill-style-guide.md` — normative ASEN LLM-runtime Skill contract.
