# Evidence Manifest (P2-A)

The final acceptance run should emit `evidence-manifest.json` with:
- `candidateSha`, `workflowRun`, `platform`, `nodeVersion`, `piVersion`
- `toolVersions`, `tests[]` (`name`, `result`)
- `reviewPolicy`, `reviewerIds[]`, `receiptHashes[]`
- `verdict` (`FULL`, `PARTIAL`, `BLOCKED`, `WAIVED`)
- `missingEvidence[]`

Waiver changes verdict to `WAIVED`, never to `FULL`.
