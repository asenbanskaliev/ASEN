---
name: asen-review
description: Perform independent candidate-bound review before ASEN verification when risk or workflow requires it.
---
# ASEN Review
1. Freeze the repository and candidate revision being reviewed.
2. Reviewer is read-only and independent from the writer for required independent review.
3. Review scope, behavior, tests, rollback and unresolved risk.
4. Record findings against the exact repository and candidate.
5. Critical or high findings block verification.
6. Any corrective source change creates a new candidate and invalidates the prior review authority.
7. Verification must consume the review/evidence for that same candidate, never a nearby revision.
