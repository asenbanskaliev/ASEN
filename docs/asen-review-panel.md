# Candidate-only Review panel

`src/runtime/review-panel.ts` provides a narrow, read-only presentation slice for UI-06 Review.

## Descriptor boundary

`prepareReviewPanelDescriptor` accepts only an existing `OrdinaryReviewCheckout`. It first asserts that the checkout was genuinely issued by the ordinary review controller, then immediately revalidates its exact local Git revision, tree, parent, directory identity, index flags, and clean state. Any forged, malformed, dirty, stale, or failed revalidation returns `null`; errors and source details are not exposed.

A successful result is deeply frozen and contains only:

- schema version `1`;
- candidate kind `commit` or `pr_slice` from the genuine request;
- the full exact revision, tree identity, and parent identity;
- fixed `review-needed`, `unavailable`, `not-acknowledged`, and `not-approved` labels.

The preparation step is descriptive. It does not claim or consume checkout/request provenance and does not create a provider session, run native review, or establish approval.

## Rendering boundary

`renderReviewPanel` is pure. It uses the shared terminal sanitization, grapheme, and visible-width truncation behavior and has no Git, filesystem, provider, model, approval, delivery, or acknowledgement operation. Model verdicts, findings, human acceptance, host notification ACK, structural acceptance, raw payloads, paths, and repository/session/participant/task data are not inputs or fallbacks.

When no current genuine descriptor is available, the panel reports `Review unavailable`. Candidate output always keeps native status unavailable, native acknowledgement not acknowledged, and delivery approval not approved.

This is a partial candidate-only UI-06 presentation slice. It does not provide native review status or lineage, independent review authority, delivery approval, a full Review viewer, shared UI integration, or canonical UI-06/FULL completion.
