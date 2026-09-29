---
name: asen-skill-authoring
description: "Trigger: create skill, new skill, reusable agent behavior. Create concise Pi-native runtime contracts with explicit activation, gates and outputs."
---
## Activation Contract
Use when a reusable workflow, project convention or decision tree should become a Pi-native skill.
## Hard Rules
- Read and follow `docs/skill-style-guide.md` before authoring.
- A skill is an LLM runtime contract, not general documentation.
- Do not create a skill for one-off work or rules better enforced in executable code/tests.
- Use the guide's exact frontmatter, ordered sections, imperative rules, 180–450 body-token target and 1000-token hard maximum.
- Use ASEN-native names and exact local `references/` or `assets/` support files.
- Index project Skills at `.asen/skill-registry.md` after creation, move or rename.
- Claim FULL behavioral parity only with automated positive and negative evidence; prohibit invented authority and unsafe fallbacks explicitly.
## Decision Gates
| Situation | Action |
| --- | --- |
| Existing skill covers behavior | Improve it instead |
| Long examples/templates needed | Put them in local assets/references |
| Critical invariant can be executable | Enforce it in code/tests as well |
## Execution Steps
1. Confirm behavior is reusable and non-duplicative.
2. Define the exact trigger-first frontmatter required by the guide.
3. Write Activation Contract, Hard Rules, Decision Gates, Execution Steps, Output Contract and References in that order.
4. Add supporting local files only when needed.
5. Refresh registry and run skill audit.
## Output Contract
Return files created/changed, behavior covered, supporting files, registry refresh and verification.
## References
- `docs/skill-style-guide.md` — normative ASEN LLM-runtime Skill contract.
