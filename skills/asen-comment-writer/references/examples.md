# Comment examples

Examples moved from the original `asen-comment-writer` Skill without changing their wording. Apply its language, evidence and permission rules before reuse.

### Request change

```markdown
Good approach overall. I'd split this into a separate commit because it mixes validation logic with UI wiring.

That keeps the reviewer's focus narrower and makes rollback cleaner if the integration fails.
```

### Approve with a note

```markdown
Approved. The scope is clear and the change is well-contained.

For the next PR, add links to the previous and following PRs so the chain stays navigable.
```

### Ask for split

```markdown
This PR is large for one review (about 600 changed lines). Could we split it, or follow the repo's size policy if it allows one PR?

Suggested order: foundation + tests first, then integration, then docs. That gives each review a clear start and end.
```
