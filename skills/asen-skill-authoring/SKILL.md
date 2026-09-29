---
name: asen-skill-authoring
description: "Trigger: create skill, new skill, reusable agent behavior. Create concise Pi-native runtime contracts with explicit activation, gates and outputs."
---
## Activation Contract
Use when a reusable workflow, project convention or decision tree should become a Pi-native skill.
## Hard Rules
- A skill is an LLM runtime contract, not general documentation.
- Do not create a skill for one-off work or rules better enforced in executable code/tests.
- Use ASEN-native names and exact local references.
- Refresh the skill registry after creation/move/rename.
## Decision Gates
| Situation | Action |
| --- | --- |
| Existing skill covers behavior | Improve it instead |
| Long examples/templates needed | Put them in local assets/references |
| Critical invariant can be executable | Enforce it in code/tests as well |
## Execution Steps
1. Confirm behavior is reusable and non-duplicative.
2. Define trigger-rich frontmatter.
3. Write Activation Contract, Hard Rules, Decision Gates, Execution Steps, Output Contract and References.
4. Add supporting local files only when needed.
5. Refresh registry and run skill audit.
## Output Contract
Return files created/changed, behavior covered, supporting files, registry refresh and verification.
## References
None.
