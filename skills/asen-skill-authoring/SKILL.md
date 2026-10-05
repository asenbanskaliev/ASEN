---
name: asen-skill-authoring
description: "Trigger: create skill, update skill, reusable agent behavior. Author a strict Pi-native runtime Skill contract."
license: Apache-2.0
metadata:
  author: ASEN
  version: "1.0.0"
---
## Activation Contract
Activate when creating or updating reusable LLM runtime behavior, project conventions, or decision gates. Do not activate for one-off instructions, ordinary documentation, or policy better enforced only through executable code. Read `docs/skill-style-guide.md` as the normative contract before writing.

## Hard Rules
- Treat each Skill as an imperative runtime contract, not a tutorial.
- Use exact frontmatter fields `name`, `description`, `license`, and `metadata`; under metadata use only `author` and `version`.
- Match the kebab-case name to its directory and write one quoted, trigger-first description line of at most 250 characters.
- Use the six required sections in exact order. You must not add a Keywords section.
- Target 180–450 body words. Treat 700 as the recommended ceiling that requires moving material, and 1000 as the hard maximum.
- Keep support paths repository-local. Put reusable examples or templates in local `assets/`; put extended rationale, schemas, or guidance in local `references/`.
- Register project Skills in `.asen/skill-registry.md`; do not implement or invent registry contents when registry generation is outside scope.
- Do not duplicate behavior, hide enforceable policy only in prose, invent authority, or claim unsupported parity.

## Decision Gates
| Situation | Action |
| --- | --- |
| Existing Skill already owns the behavior | Update it and preserve its activation semantics |
| Behavior is reusable and distinct | Create a new Skill |
| Agent copies material into an output | Store that material in `assets/` |
| Agent reads supporting explanation | Store that material in `references/` |
| Rule can be enforced deterministically | Add code or tests alongside the prose contract |

## Execution Steps
1. Confirm the requested pattern is reusable, non-duplicative, and appropriate for an LLM runtime contract.
2. Consult the normative guide and inspect the owning project conventions.
3. Define activation and non-activation cases before writing rules.
4. Write exact frontmatter and the six ordered sections.
5. Make unconditional rules explicit, place choices in Decision Gates, and keep actions ordered.
6. Add only necessary local assets or references and validate every path.
7. Record project Skill registration impact and run the applicable audit and behavior tests.

## Output Contract
Return changed files, new-versus-updated status, behavior covered, supporting files, registry impact for `.asen/skill-registry.md`, verification needs and results, unresolved decisions, and any parity evidence still missing.

## References
- `docs/skill-style-guide.md` — normative ASEN Skill contract.
