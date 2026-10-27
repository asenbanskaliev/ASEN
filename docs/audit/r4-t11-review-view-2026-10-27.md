# R4 independent review — T11 Pi-only candidate

Date: 2026-10-27 (Europe/Madrid)

## Review identity and scope

- Reviewed candidate before correction: `8d100d7a10e3532c6fe17f4775e8bcc81cce4046`.
- Adopted T11 scope: Pi 1.2 host integration only, as recorded in ODD S11/L480. External clients remain deferred.
- Reviewed the Pi host preflight, mode/context validation, registration ordering and the candidate review-view/session boundary because reviewer-view integrity is an explicit T11/T05 trust boundary.
- This is an independent code-path and adversarial regression review. It is not a CodeRabbit, hosted security scanner, or third-party certification.

## Finding R4-01 — reviewer view accepted modified candidate bytes

**Severity: Medium. Status: corrected in this candidate; final CI admission pending.**

The materializer created read-only files, but the same owning account can change their permissions. Before this correction, `readReviewViewFile` checked that the target was a regular file and then returned its bytes; `revalidateReviewView` checked only the root identity and original manifest. Neither compared the materialized bytes with the candidate tree. I reproduced this on the reviewed SHA: changed `src/file.txt` from `candidate` to `tampered`, then `readReviewViewFile` returned `tampered` successfully.

Correction: the view now retains the candidate entry path, size and SHA-256. Reads verify the returned bytes against that claim. Session revalidation checks every materialized entry against the exact manifest and rejects linked/non-directory parent components. A regression test performs the permission change and byte substitution, then asserts both read and session revalidation fail.

## Other reviewed controls

- Pi versions are parsed as exact stable numeric releases and checked against the declared `1.2.0` minimum.
- Host API registration methods and inventory names are inspected without invoking accessors; missing, malformed, duplicate or colliding command/tool inventories fail before registration.
- Only the four declared Pi execution modes are accepted; context is validated before lifecycle mutation.
- T11 does not claim equivalent external-client capabilities. The adopted scope and deferred clients are explicit.
- Review-session candidate tree identity is checked against the frozen manifest before use; reviewer identifiers are descriptive and do not mint authentication or review authority.

No additional critical or high finding was established in these reviewed boundaries. This bounded R4 does not certify the entire 62-commit PR, provider behavior, external runtimes, or an adversarial same-user operating-system sandbox. The review view remains a same-user filesystem artifact; content checks detect persistent tampering when read or revalidated, but do not provide an OS-enforced immutable snapshot against a concurrent process racing between validation and use.

## Verification

- Before-fix reproduction on `8d100d7`: changed view content was returned (`tampered`).
- Corrected regression and related review chain/session tests: 13 passed, 0 failed, 0 skipped.
- `npm run typecheck`: pass.
- `git diff --check`: pass.
- The new commit's required GitHub workflows and exact-SHA Pi runtime evidence remain the final admission gate; no FULL claim is made before those results.
