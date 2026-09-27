---
name: asen-safe-change
description: Apply ASEN's deterministic engineering gates to a code change.
---

# ASEN Safe Change

Use for non-trivial engineering mutations.

1. Identify repository, scope, risk and allowed edit surfaces.
2. Record the plan before mutation when required by Flow.
3. Prefer tests that demonstrate the defect/requirement before implementation.
4. Keep one writer per surface unless work is explicitly isolated.
5. Bind executed test/review evidence to the exact candidate.
6. High or unknown risk requires independent review.
7. A changed candidate invalidates prior verification.
8. Never treat narrative confidence as verification evidence.
9. Do not perform destructive Git operations or publication without explicit authority.
