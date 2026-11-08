# M5-06 receipt provenance — GitHub OIDC/Sigstore attestations versus P1 external SSH signing

Status: research and decision-support only. Nothing here is implemented, wired, or published
as an M5-06 change. No workflow, registry, or acceptance-counter file was touched while
writing this document. `globalFull` stays `false`.

Baseline terminology: `docs/parity/m5-06-consumption-contract.md` (local, unpublished) defines
P1 = owner SSH-signs the canonical receipt bytes; the pinned PUBLIC half travels as a tracked
repository file, the signature arrives out-of-band as a separate artifact; the adapter verifies
`sig` over the exact bytes. P2 = GitHub environment protection rule (required reviewers) whose
deployment approval event stands in for the consent record.

## 1. Feasibility of `actions/attest` over the generated artifacts

Verified as of 2026-11-08 against upstream docs:

- `actions/attest-build-provenance` v4+ is a wrapper; new implementations should call
  `actions/attest@v4` directly (https://github.com/actions/attest-build-provenance README).
- Requirements: job permissions `id-token: write`, `attestations: write`
  (+ `artifact-metadata: write` only for OCI storage records).
- Modes: default SLSA v1 build provenance; `sbom-path` for SPDX/CycloneDX; or a **custom
  predicate** (`predicate-type`/`predicate`/`predicate-path`, ≤16 MB). A receipt JSON can be
  attested two ways: (a) attest the artifact digest with default provenance and bind the
  receipt by content; or (b) custom predicate carrying the receipt fields.
- Output: a Sigstore bundle (JSON, `sigstore_bundle.proto` format) written to the runner FS
  (`bundle-path`, aggregated in `$RUNNER_TEMP/created_attestation_paths.txt`) **and** uploaded
  to the GitHub attestations API, keyed to the repository. Availability: public repos on all
  current plans (public-good Sigstore/Rekor); private/internal repos require Enterprise Cloud
  (GitHub private Sigstore instance); not supported on GHES.
- Fit for ASEN acceptance receipts: feasible for CI-produced witness artifacts. It is NOT a
  consent mechanism: the signer identity is the workflow run, never a human.

## 2. Cryptographic verification of signature and digest

- Signature: short-lived Sigstore-issued signing certificate over an DSSE envelope; chain
  verification against Sigstore roots; `verifiedTimestamps` (certificate timestamp + signed
  TSA/Rekor entries) are part of the bundle.
- Digest: the in-toto subject carries `sha256:` digests; the consumer recomputes the digest of
  the bytes it actually holds and requires an exact match. Offline verification is supported
  via `gh attestation verify --bundle` and, for air-gapped use, `--custom-trusted-root
  trusted_root.jsonl` (https://cli.github.com/manual/gh_attestation_verify).

## 3. Allowed repository and workflow identity

The certificate/OIDC-derived fields that verification can enforce:

- `--repo`/`--owner` (attestation linkage lookup + owner URI enforcement)
- `--signer-repo` and `--signer-workflow`
  (e.g. `YOUR-ORG/REPO/.github/workflows/<file>.yml@refs/heads/main`)
- `--cert-identity`, `--cert-oidc-issuer` (default enforced:
  `https://token.actions.githubusercontent.com`)
- `--predicate-type` (default `https://slsa.dev/provenance/v1`)
- `--deny-self-hosted-runners`
- Reusable-workflow (trusted builder) pinning raises the build to SLSA v1 Build Level 3 and
  prevents the caller workflow from influencing the signer (https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/increase-security-rating).

Policy for M5-06 must pin: exact repo slug, exact workflow file + ref of the signer, issuer,
public-good log, and github-hosted runners.

## 4. Source SHA and run attempt binding

- `--source-digest <sha>`: enforces the source repository digest (git SHA of the checkout the
  build ran from).
- `--source-ref <ref>`: enforces `Source Repository Ref` (e.g. `refs/heads/main`).
- Run identity: certificate field `Runner Invocation URI` =
  `.../actions/runs/<run_id>/attempts/<run_attempt>`; the SLSA v1 `builder.id` encodes the same
  URI. There is no dedicated gh-CLI flag for attempt, so the adapter should parse `builder.id`
  / the invocation URI and require exact `run_id` + `attempts/N` equality with the expected run
  (the OIDC token itself carries `run_id`, `run_number`, `run_attempt`;
  https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-with-reusable-workflows).
- The attestation summary page exposes Commit, Workflow File and Build Summary links for
  human cross-check (example: https://github.com/github/actions-oidc-gateway-example/attestations/5120302).

## 5. Duplicate and stale receipt rejection

- Freshness is a consumer policy: use `verifiedTimestamps` (signed, unforgeable) and reject any
  receipt whose signing time is outside the authorized run window (the P1 ±0-skew window idea
  transfers directly).
- Duplicate/replay: enforce one-shot consumption per `(run_id, attempt, subject-digest)` tuple
  in a durable consumer ledger (append-only, scoped by session/project like the existing
  journals). Attestation IDs from the API are monotonically referenceable; a second
  verification of the same attestation against a *different* digest must fail on the digest
  equality check (Section 2), so a stale bundle cannot masquerade as a newer run.
- Stale-run rejection: `--source-digest` must equal the SHA the consumer intended to accept;
  re-running the workflow yields a new run/attempt and a new signed timestamp, never a reuse of
  the old bundle for the new claim.

## 6. Cross-run reuse policy

- The signature binds *artifact digest* + *builder identity*, not a consumer decision. A bundle
  from run A may only ever be consumed as evidence *of run A*. Any policy that maps a bundle to
  a different run (different `run_id/attempt` or different `--source-digest`) must fail closed.
- Recommended invariants: (1) builder.id run/attempt equality; (2) subject digest equality with
  the bytes on disk; (3) source SHA equality with the authorized candidate; (4) timestamp within
  the authorized window; (5) single-consumption ledger entry. These are exactly the properties
  the P1 design wanted from SSH + a window check, obtained here without managing key material.

## 7. What provenance proves versus functional equivalence

Proven (cryptographically): this exact bytes were produced by this repository, this workflow
file at this ref, this source SHA, this run/attempt, on GitHub-hosted runners, at a signed time.

NOT proven by provenance:

- that the artifact is correct, safe, or semantically equivalent to any reference behavior —
  GitHub's own guidance: attestations are "not a guarantee that an artifact is secure"; they
  link source and build instructions; the consumer defines and evaluates policy
  (https://docs.github.com/en/actions/concepts/security/artifact-attestations).
- that a human reviewed or consented to anything. CI attestation is machine identity. A
  required-reviewers/environment approval (P2) is a *workflow approval control* — it proves the
  deployment was gated, not that a named human authorized the specific Pi-side action, and it
  must never be mapped to consent inside Pi.

Functional equivalence therefore still comes only from executed, admitted acceptance runs
(witness artifacts that themselves can be attested), and the FULL certification machinery
stays as-is: attestation evidence feeds gates; it does not mark UI-C receipts and does not
change `globalFull:false` until every normative requirement is independently satisfied.

## 8. Comparison with P1 (external SSH signing)

| Dimension | P1 SSH (owner key) | GitHub OIDC/Sigstore attestation |
| --- | --- | --- |
| Identity proven | A human key owner signed these exact bytes | A specific repo+workflow+source-SHA+run built these exact bytes |
| Key management | Pin/rotate public half out-of-band | None: short-lived certs, public roots |
| Tamper evidence | Signature over canonical bytes | DSSE over in-toto statement + bundle timestamps |
| Freshness control | Timestamp window check (±0 skew) | Signed `verifiedTimestamps` + window check |
| Human consent signal | Yes, closest analogue (owner's key) | No — machine identity only |
| Non-repudiation vs insiders | Strong per-person (one key) | Strong per-workflow; any committer who can trigger the pinned workflow at the pinned SHA is covered by policy |
| Verifiable offline | Yes (`ssh-keygen -Y verify`) | Yes (`gh --bundle`, `--custom-trusted-root`) |
| Availability constraints | None | Not on GHES; private repos need Enterprise Cloud |
| Self-forgery resistance | Owner could sign arbitrary bytes | Workflow can only attest what its run actually built (digest is computed by the action from the runner FS) |

Recommendation (preliminary, pending owner approval):

- Adopt OIDC/Sigstore (call it P3) as the primary provenance for CI-generated receipt/witness
  artifacts, with the Section 6 invariants enforced inside the M5-06 adapter.
- Keep P1 only if/where a *human* signature over a receipt must be provable (e.g., manual
  consent records); OIDC cannot replace that role because it carries no human identity.
- Keep P2 strictly as a workflow approval control; never equate it with human consent in Pi.

## 9. Explicit non-goals of this document

No workflow YAML change, no `actions/attest` wiring, no registry edit, no acceptance-registry
or `globalFull` change, no claim that any receipt is admitted. Implementation requires a
separate owner authorization, per the M5-06 approval questions in the consumption-contract doc.
