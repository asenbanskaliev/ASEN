---
name: asen-skill-audit
description: "Trigger: audit skills, improve skills, skill quality. Audit Pi-native skills for activation clarity, executable gates, preserved intent and registry consistency."
---
## Activation Contract
Use when reviewing or improving existing skill contracts.
## Hard Rules
- Preserve meaningful behavior and author intent.
- Default to audit-only unless modification is authorized.
- Do not invent triggers or policy to make a skill look complete.
- Move explanation/examples out of the runtime contract when they obscure execution.
## Decision Gates
| Situation | Action |
| --- | --- |
| Invalid metadata/sections | Correct structural defect |
| Rule is ambiguous/conflicting | Report for decision |
| Runtime rule lacks executable enforcement | Recommend/add gate when authorized |
## Execution Steps
1. Read registry and exact SKILL.md.
2. Audit metadata, activation, hard rules, gates, execution, outputs and references.
3. Compare with executable enforcement/tests.
4. Apply only authorized safe improvements.
5. Refresh registry and re-run audits.
## Output Contract
Return skills audited, defects by severity, changes, enforcement gaps and unresolved decisions.
## References
None.
