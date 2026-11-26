---
name: asen-comment-writer
description: "Trigger: PR feedback, issue replies, reviews, Slack messages, or GitHub comments. Write warm, direct collaboration comments."
license: Apache-2.0
metadata:
  author: ASEN
  version: "1.0"
---

## Activation Contract

Load this skill whenever you write a comment that another human will read.

Use it for:

- GitHub PR or issue comments.
- Review feedback and requested changes.
- Maintainer replies.
- Slack, Discord, or async project updates.

Do not activate for unrelated UI copy, documentation, or source-code comments.

## Hard Rules

| Rule | Requirement |
|------|-------------|
| Be useful fast | Start with the actionable point. Do not recap the whole PR before feedback. |
| Be warm and direct | Sound like a thoughtful teammate, not a corporate bot. |
| Keep it short | Prefer 1 to 3 short paragraphs or a tight bullet list. |
| Explain why | Give the technical reason when asking for a change. |
| Avoid pile-ons | Comment on the highest-value issue, not every tiny preference. |
| Match target context language | Write in the target context language by default: Spanish issue/thread -> Spanish comment, English issue/thread -> English comment, mixed context -> target message language. If the user explicitly requests a language or tone, follow that request. Do not use the active persona as the source of truth for public comments. For Spanish comments, use neutral/professional Spanish by default unless the user or target context clearly calls for regional tone. |
| No em dashes | Use commas, periods, or parentheses instead. |

- Never invent review evidence, approval or permission to publish.

## Decision Gates

| Situation | Action |
| --- | --- |
| Explicit language or tone requested | Follow the request, not the active persona. |
| Spanish, English or mixed target context | Use the target message language; keep public Spanish neutral unless asked otherwise. |
| Request for change or split | State the highest-value issue, technical reason and one concrete action. |
| Approval requested without verified evidence | Do not claim approval; ask one focused question instead. |

## Execution Steps

1. Identify the recipient, target context, requested language and message type.
2. Lead with the actionable observation. Explain the reason only when useful.
3. Inspect the PR facts when relevant using the command below; never assume an approval.
4. Check brevity, tone, clear next action and absence of em dashes.

### Commands

```bash
# Inspect a PR before writing review feedback
gh pr view <PR_NUMBER> --json title,body,additions,deletions,changedFiles
```

## Output Contract

Return one warm, direct comment, normally 1 to 3 short paragraphs or a tight bullet list.

### Comment Formula

```text
<Direct observation or request>

<Why it matters, only if needed>

<Concrete next action>
```

## References

- [Comment examples](references/examples.md) (local examples; no external authority).
