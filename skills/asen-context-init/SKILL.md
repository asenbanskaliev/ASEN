---
name: asen-context-init
description: "Trigger: initialize project context, start structured engineering work. Detect real project conventions, test/build capabilities and available Pi-native skills before planning."
---
## Activation Contract
Use at the start of structured work when project capabilities or conventions are not yet established.
## Hard Rules
- Inspect the real repository; never guess stack, commands, architecture or conventions.
- Discover Pi-native skills by exact path; the skill files remain source of truth.
- Do not mutate product code during context discovery.
- Record unknown capabilities explicitly instead of inventing defaults.
## Decision Gates
| Situation | Action |
| --- | --- |
| Context already current and candidate-bound | Reuse it |
| Stack or commands changed | Refresh context |
| Required capability is unknown | Mark unresolved and block dependent assumptions |
## Execution Steps
1. Detect stack, architecture, test/build commands and repository policy.
2. Discover applicable project skills and their exact paths.
3. Record concise context and unresolved capabilities.
4. Return the next safe planning action.
## Output Contract
Return exactly one machine-readable JSON object and no surrounding Markdown or commentary. Include detected context, commands, skill paths, unresolved facts and evidence used. The object must be non-empty.
## References
None.
