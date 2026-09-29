---
name: asen-skill-registry
description: "Trigger: refresh, index, or discover installed Skills. Generate the deterministic ASEN registry and report exact paths and diagnostics."
license: Apache-2.0
metadata:
  author: ASEN
  version: "1.0.0"
---
## Activation Contract
Activate to refresh, index, or discover installed project, user, and global Skills, including after installation, removal, movement, rename, or content change. Activate before work that needs a fresh discoverable index. Must not activate for candidate-bound static Skill authority or arbitrary code changes; those use their already issued exact paths and applicable workflow contracts.

## Hard Rules
Use `.asen/skill-registry.md` and its schema-1 cache. Keep each `SKILL.md` authoritative; index trigger metadata and exact canonical paths without replacing source contracts. Discover recursively. Apply project > user > global precedence, configured order within each scope, then canonical lexical order; the first accepted name wins.

Diagnose invalid metadata, missing sources, excluded names, duplicate names, unreadable paths, and paths outside-source without aborting other discovery. Treat a successful empty registry as valid. Use a deterministic fingerprint that invalidates for add, remove, move, content, source-order, and registry tampering. Resolve and report exact canonical paths; unknown names fail closed.

Forbid injecting discovered dynamic paths into candidate-bound static authority. Never guess a Skill, silently retain stale entries, or rewrite source Skills.

## Decision Gates
| Situation | Action |
| --- | --- |
| Valid fingerprint, cache, and registry hash | Return a cache hit with no local rewrite. |
| Any input or integrity mismatch | Regenerate registry and cache deterministically. |
| Optional memory mirror available | Attempt it on hit and miss; failure never blocks successful local generation. |
| Requested name is unknown or ambiguous | Fail closed and report the unresolved ambiguity. |

## Execution Steps
1. Canonicalize configured sources and scan them recursively in precedence order.
2. Validate metadata and containment, collect entries and deterministic diagnostics, then deduplicate by accepted name.
3. Compare the complete fingerprint, schema-1 cache, and registry hash; preserve local files on a valid hit.
4. On a miss, persist atomically registry first and cache second. Do not publish cache state when registry persistence fails.
5. Attempt the optional memory mirror after local success, sanitizing mirror failures without changing local success.

## Output Contract
Return the registry path, count, cache status, accepted entries with exact canonical paths, diagnostics, and persistence result. State whether the result was a hit, regeneration, or successful empty registry. Report unresolved ambiguity explicitly and never convert it into inferred authority.

## References
None.
