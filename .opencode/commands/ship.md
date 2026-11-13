---
description: Prepare a release with changelog, gates and rollback
agent: release-engineer
---
Load skills release-prep and verify. Prepare a release for $ARGUMENTS.

Freeze scope, derive the version from the public contract, write the changelog by user impact, and run the full gate: tests, typecheck, lint, security scan, build, migration dry-run.

Deliver: version, changelog, rollout plan with abort condition, tested rollback steps, and what was not verified.
