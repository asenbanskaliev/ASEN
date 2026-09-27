---
name: asen-tdd
description: Use test-first behavior for deterministic code changes where a meaningful failing test can be demonstrated.
---
# ASEN TDD
1. State the behavior to prove and candidate scope.
2. Add or identify the smallest deterministic test that must fail before the fix.
3. Execute it and record RED as expected-fail evidence; never fabricate RED.
4. Implement the minimum authorized change.
5. Execute the focused test and record GREEN against the current candidate.
6. Refactor only while GREEN remains true.
7. Run proportionate regression checks.
8. A real unresolved failure blocks verification; expected RED does not.
9. If meaningful RED is impossible, record why and use proportionate structural/functional verification instead of pretending TDD occurred.
