---
name: asen-explore
description: "Trigger: explore, investigate, understand codebase, compare approaches. Perform read-only evidence-based exploration before committing to a change."
---
## Activation Contract
Use when scope, mechanism, affected areas or viable approaches require investigation.
## Hard Rules
- Exploration is read-only.
- Read actual entry points, implementation and tests; never infer architecture from filenames alone.
- Separate observed facts from hypotheses.
- Do not authorize implementation.
## Decision Gates
| Situation | Action |
| --- | --- |
| One bounded known edit | Exploration may be skipped |
| Direct exploration has exceeded three focused queries or 40 KiB of observed output, and more evidence is necessary | Recommend one isolated Explorer; never relaunch equivalent queued/running work |
| Evidence contradicts the request hypothesis | Report the contradiction and follow evidence |
## Execution Steps
1. Resolve the exact question and repository scope.
2. Map current behavior, affected code, tests, dependencies and constraints.
3. Keep a bounded count of focused tool queries and bytes of observed output. Prefer CodeGraph where installed; treat unavailable indexing as a reason for bounded file fallback, not as source evidence.
4. When further investigation is necessary after three focused queries or 40 KiB, return the accumulated evidence and request one isolated Explorer handoff instead of repeatedly querying the same sources. Do not create nested Explorer tasks or poll background agents for completion.
5. Compare viable approaches when more than one exists.
6. Identify risks, unknowns and the smallest next decision.
## Output Contract
Return current state, affected areas, approaches, evidence, risks, unknowns and readiness for proposal.
## References
None.
\n## Background Completion Contract\n- Return a compact read-only report tied to the original question; distinguish observed facts from assumptions and unknowns.\n- When started asynchronously, retain the task ID; completion is delivered by an event, not by sleep or repeated status polling. Inspect status only when there is a genuine next orchestration decision.\n- Never interpret an Explorer report as permission to write, merge, rerun a failed worker, or accept a reviewer result.\n