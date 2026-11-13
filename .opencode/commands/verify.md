---
description: Run lint, typecheck, tests and build
agent: test-engineer
---
Load skill verify. Detect this project's stack and run format check, lint, typecheck, tests and build in that order. If arguments are given, verify only $ARGUMENTS.

Stop at the first failure, quote the failing lines, and report command, exit code and what was not run. Do not claim success without running them.
