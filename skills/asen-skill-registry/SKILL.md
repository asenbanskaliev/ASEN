---
name: asen-skill-registry
description: "Trigger: skill registry, refresh skills, discover skills. Index Pi-native skills by trigger and exact path without replacing their runtime contracts."
---
## Activation Contract
Use after adding, removing, moving or renaming skills, and before delegation when the available skill set may have changed.
## Hard Rules
- The registry is an index; each SKILL.md remains source of truth.
- Preserve exact paths and trigger text; do not substitute generated summaries for skill contents.
- Prefer project-level skill definitions when duplicate names exist.
- Empty discovery produces an explicit empty registry, never guessed skills.
## Decision Gates
| Situation | Action |
| --- | --- |
| Duplicate skill name | Prefer project-level exact path |
| Skill metadata/path changed | Refresh registry |
| Delegating work | Pass exact matching SKILL.md paths |
## Execution Steps
1. Scan known Pi/project skill locations.
2. Read only metadata needed for indexing.
3. Deduplicate deterministically.
4. Produce the exact-path registry and cache metadata.
## Output Contract
Return registry location/state, indexed count, exact paths, duplicates/skips and refresh status.
## References
None.
