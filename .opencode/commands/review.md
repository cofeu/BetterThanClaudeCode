---
description: Review changes for bugs, security and missing tests
agent: code-reviewer
subagent: true
---
Load skill code-review. Review $ARGUMENTS.

Read the actual diff first, then the full files around each hunk. Report findings in severity order with file:line and a concrete fix. Run tests or a repro before accepting the change. Never approve from the diff alone when auth, money, migrations or concurrency are involved.
