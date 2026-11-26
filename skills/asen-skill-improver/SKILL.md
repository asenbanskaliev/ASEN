---
name: asen-skill-improver
description: "Trigger: improve skills, audit skills, refactor skills, skill quality. Audit and upgrade existing LLM-first skills."
license: Apache-2.0
metadata:
  author: ASEN
  version: "1.0"
---

## Activation Contract

Use this skill when auditing, refactoring, normalizing, or improving existing `SKILL.md` files. Use `asen-skill-authoring` when creating a brand-new skill from a reusable pattern. Do not activate for one-off prose or unrelated code edits.

## Hard Rules

- Read `docs/skill-style-guide.md` first and treat it as the normative style contract.
- Treat `SKILL.md` as the source of truth; preserve author intent, critical rules, activation semantics, and output requirements.
- In Pi use the effective session skill view for names, triggers, scopes, and exact paths. The shared `.asen/skill-registry.md` is a disk-only fallback and omits runtime-only skills.
- Default to audit-only. Modify files only when the user explicitly asks to apply improvements.
- Never delete meaningful content silently; move long explanation, examples, templates, or schemas into local `references/` or `assets/`.
- Do not invent triggers, policies, or domain rules. Mark ambiguous cases for human review.
- Verify support paths inside this repository; never use old upstream paths or external references.
- Do not claim behavioral parity from format alone; require positive and negative tests.

## Decision Gates

| Situation | Action |
| --- | --- |
| Missing or invalid frontmatter | Fix `name`, quoted one-line `description`, `license`, and `metadata` |
| Skill reads like tutorial docs | Convert to runtime instructions and move background to `references/` |
| Body exceeds budget | Preserve rules, move examples/background to supporting files |
| Branching logic hidden in prose | Convert to a compact decision table |
| Rules conflict or intent is unclear | Report the issue; do not rewrite that rule automatically |
| Support path is absent or inherited from upstream | Verify the local target; report ambiguity instead of guessing |

## Execution Steps

1. Read `docs/skill-style-guide.md`.
2. Use the effective session view (`<available_skills>` plus any `Effective session skills` rows) to select skills. If neither is present, report that limitation and use `.asen/skill-registry.md` as a disk-only fallback; if absent, scan known skill directories for `*/SKILL.md`.
3. For each selected skill, audit metadata, triggers, six ordered sections, 180–450 body-word target (700 advisory, 1000 hard limit), actionability, gates, output contract, and existing local references.
4. Return an audit report grouped by skill with severity and exact proposed changes.
5. In apply mode, edit only safe issues, preserve content, create supporting files when needed, then test changes and refresh or request `/skill-registry:refresh`.

## Output Contract

Return:
- Skills audited and paths used.
- Issues found, grouped by severity.
- Files changed, if apply mode was requested.
- Registry refresh recommendation when skill metadata or paths changed.
- Ambiguities that need human review.

## References

- `docs/skill-style-guide.md` — normative LLM-first skill style guide.
- `skills/asen-skill-registry/SKILL.md` — registry refresh and indexing contract.

