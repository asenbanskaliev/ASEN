---
name: asen-work-unit
description: Keep implementation, tests, evidence and rollback aligned to one reviewable behavior unit.
---
# ASEN Work Unit
1. Define one observable behavior or correction and its rollback boundary.
2. Keep its implementation and focused verification together.
3. Avoid splitting work merely by file type when that destroys a coherent review unit.
4. Freeze a candidate only after source-mutating steps are complete.
5. Bind tests and review evidence to that candidate.
6. If scope expands into independent behavior or rollback boundaries, split the work unit.
7. Do not publish or merge solely because the unit is internally complete; repository delivery authority remains separate.
