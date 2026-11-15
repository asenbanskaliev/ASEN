## Summary
<!-- What changed and why (one paragraph) -->

## SHA Validated
<!-- Exact commit SHA or evidence that the base candidate was verified -->

## Risk Level
- [ ] Low - docs, metadata, or test changes only
- [ ] Medium - feature or refactor without behavior change
- [ ] High - behavior change, managed install, security, auth, or parser changes
- [ ] Critical - release gate, cross-platform safety, or public contract change

## Evidence Linked
- [ ] Typecheck passed
- [ ] Relevant tests passed
- [ ] Audit script(s) passed
- [ ] Release gate or a documented scoped check passed
- [ ] If high-risk, include actual output or receipt link

## Reviewer Checklist
- [ ] No external reference paths leaked into tracked files
- [ ] No `PARTIAL/FULL` claim without its linked evidence or scope wording
- [ ] No broad registry or distribution claim beyond the tested candidate
- [ ] Markdown source links are unchanged or corrected in the same PR

## Notes For Reviewers
<!-- Mention any known `NOT ADMITTED` items, platform limitations, or release debt touched by this PR -->