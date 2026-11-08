# M5-07 workflow proposal — C02–C05 two-real-Pi capture job

Status: PREPARED, NOT PUBLISHED. No change to `.github/workflows/` ships in this batch. The block
below is the exact job intended for the acceptance workflow, held here until the owner reviews
scope, model lane, cost and safety. No provider execution happened or will happen before that
review.

## Owner-review items before publishing

1. Model lane: pinned free `beam`/`beam:cloud` via `OLLAMA_API_KEY` only — same as the shipped C01
   job. Confirm the free lane remains acceptable for four more dual-host turns per run.
2. Cost/time: one extra job ≈ four C01 runs (dual PTY, ≤ ~3 min per case pair, sequential).
3. Consent boundary: C02–C05 are registry-verified non-consent cases; the producer refuses any
   consent-flagged case id (pinned by `tests/r4-two-pi-beam-scenarios.test.mjs`). If the owner
   later wants C06+ captured, that is UFC-M5-02 work, not this job.
4. Output consumption: artifacts feed the UFC-M5-06 adapter ONLY after the owner approves
   `docs/parity/m5-06-consumption-contract.md`; until then reports stay inert by design.

## Proposed job block (draft, for review — do not merge as-is)

```yaml
  r4-two-pi-beam-scenarios:
    name: R4 two-real-Pi beam scenarios C02-C05
    needs: [r4-shell-asen-parity]
    if: github.repository == 'asenbanskaliev/ASEN'
    runs-on: windows-latest
    timeout-minutes: 45
    env:
      ASEN_EXPECTED_SHA: ${{ github.sha }}
      ASEN_SELECTED_MODEL: beam:cloud
      ASEN_OLLAMA_API_KEY: ${{ secrets.ASEN_OLLAMA_API_KEY }}
      ASEN_SHELL_CHECKOUT: ${{ needs.r4-shell-asen-parity.outputs.shell-checkout }}
      RUNNER_TEMP: ${{ runner.temp }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: {node-version-file: package.json}
      - run: npm ci
      # For each caseId in C02 C03 C04 C05: drive the shipped C01 dual-PTY discipline
      # (disposable fixture, sanitized env, bounded single turn per host, wx/0600 artifact),
      # grade with gradeRealScenario from scripts/r4-two-pi-beam-scenarios.mjs, and upload
      # asen-acceptance-evidence/<caseId>-two-real-Pi-Beam.json as a separate artifact.
      # A grading abort (ungrounded field, forged witness, bounds breach) fails the step:
      # NOT_EXECUTED is honest, a faked report is never produced.
      - name: capture-and-grade C02-C05 (implement only after this proposal is approved)
        run: node scripts/r4-two-pi-beam-scenarios-runner.mjs   # runner NOT yet written; it would
                                                                  # import SCENARIO_CARDS and reuse
                                                                  # the C01 runOne harness per case
      - uses: actions/upload-artifact@v4
        with:
          name: r4-scenario-reports
          path: asen-acceptance-evidence/*-two-real-Pi-Beam.json
          if-no-files-found: error
```

## Deliberate omissions

- No runner script ships in this batch: writing `r4-two-pi-beam-scenarios-runner.mjs` is the first
  step AFTER approval, because it launches real paid-free-lane model turns. Shipping it unrun
  would invite exactly the "capture by narration" failure this plan forbids.
- The grader and cards ship now with full synthetic test coverage, so the approved runner has a
  frozen contract to bind against (`asen-r4-two-real-pi-scenario/v1`).
- Stages in `registry/parity` stay `NOT_EXECUTED`; advancement remains owned by CI assembly.
