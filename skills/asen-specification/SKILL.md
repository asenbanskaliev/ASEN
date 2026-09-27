---
name: asen-specification
description: "Trigger: specification, requirements, acceptance scenarios, behavior contract. Define observable requirements and executable acceptance scenarios for a change."
---
## Activation Contract
Use when behavior must be defined precisely enough to implement and verify.
## Hard Rules
- Specify observable behavior, not implementation trivia.
- Distinguish added, modified and removed behavior.
- Each requirement has concrete scenarios with precondition, action and expected outcome.
- Unspecified behavior is not silently authorized.
## Decision Gates
| Situation | Action |
| --- | --- |
| Requirement cannot be observed | Clarify it before implementation |
| Existing behavior is modified | Record old and new contract |
| Scenario cannot be verified | Mark it unresolved, not compliant |
## Execution Steps
1. Identify affected behavioral domains.
2. Read existing behavior/specification evidence.
3. Write requirements and acceptance scenarios.
4. Map each scenario to a future verification obligation.
## Output Contract
Return requirements, scenarios, changed behavior, unresolved ambiguities and verification obligations.
## References
None.
