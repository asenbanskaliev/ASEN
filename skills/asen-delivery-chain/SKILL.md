---
name: asen-delivery-chain
description: "Trigger: chained PR, stacked PR, split large change. Slice large delivery by cohesive work units and independent rollback boundaries."
---
## Activation Contract
Use when a change is too large or coupled for one healthy review unit.
## Hard Rules
- Slice by behavior/work unit, never arbitrary file count.
- Each slice has clear base, verification and rollback.
- Do not pretend dependent slices can land independently.
- Preserve an explicit dependency graph.
## Decision Gates
| Situation | Action |
| --- | --- |
| Slice can land independently | Independent/stacked delivery is allowed |
| Slices require atomic integration | Use an explicit dependent chain/tracker strategy |
| No honest cohesive split exists | Report exception rather than code-golfing |
## Execution Steps
1. Measure candidate and work-unit boundaries.
2. Determine independent vs dependent slices.
3. Build ordered dependency graph.
4. Verify each slice against its own base/candidate.
## Output Contract
Return strategy, slices, bases, dependencies, verification and rollback for each slice.
## References
None.
