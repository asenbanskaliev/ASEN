# ASEN LLM-runtime Skill style guide

Use this guide as the normative contract for project `SKILL.md` authoring and audit. A Skill directs an LLM at runtime; it is not a tutorial or a substitute for executable policy.

## Frontmatter

Require YAML frontmatter with exactly these fields: `name`, `description`, `license`, and `metadata`; require exactly `author` and `version` under `metadata`. Use `license: Apache-2.0` unless repository policy requires another license. Use a kebab-case `name` that matches the skill directory. Write `description` as one quoted, YAML-safe physical line beginning with `Trigger:` and the phrases users or agents will say, followed by the outcome. Target at most 160 characters and never exceed 250. Do not add keyword fields or folded descriptions.

## Body contract

Write the following H2 sections once and in this exact order:

1. `Activation Contract`
2. `Hard Rules`
3. `Decision Gates`
4. `Execution Steps`
5. `Output Contract`
6. `References`

Use imperative, testable rules. Target 180–450 body tokens and enforce a hard maximum of 1000. Move rationale, examples, templates, schemas, and fixtures into local `references/` or `assets/` files before the contract becomes dense. Link only repository-local support files and verify every link.

State when the Skill activates and when it must not activate. Put unconditional invariants in Hard Rules, branching choices in a compact Decision Gates table, ordered actions in Execution Steps, and required returned evidence in Output Contract. Name prohibited behavior explicitly, including unsafe fallbacks, invented authority, unsupported claims, and out-of-scope mutation.

Use `.asen/skill-registry.md` as the project registry. Keep `SKILL.md` authoritative; the registry indexes exact paths and trigger text without replacing the contract.

## Audit and parity

Preserve activation semantics and meaningful rules when improving an existing Skill. Report ambiguity instead of inventing policy. Treat structure, loading, and file presence as necessary but insufficient evidence. Mark behavioral parity `FULL` only when automated positive and negative evidence exercises activation, gates, outputs, and prohibited behavior. Otherwise use the repository's honest partial or missing status.
