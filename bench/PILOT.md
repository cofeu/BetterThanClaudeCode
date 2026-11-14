# Pilot run — 2026-11-14

The first end-to-end run of the benchmark. It is a **pilot**, not a published evaluation: one repetition per task, free models, and a task set that turned out to be too easy.

Read this as evidence that the harness works and produces honest numbers — not as evidence that the system is better than anything.

## Setup

| Item | Value |
|---|---|
| Baseline arm | OpenCode built-in `build` agent |
| Treatment arm | `fullstack-expert` from this repository |
| Tasks | 5 (3 Python, 2 JavaScript) |
| Repetitions | 1 per task per arm |
| Runs | 10 (5 paired A/B) |
| Isolation | `bwrap` sandbox, temp run dirs, fresh `XDG_DATA_HOME`/`XDG_STATE_HOME` |
| Success | exit 0, no provider errors, visible + hidden tests pass, `tests/` untouched |

## Models

Paid providers were unavailable (`Credit balance is too low` for Anthropic, insufficient balance for others), so the pilot used free models. Quotas ran out during the suite, so the model changed between tasks:

| Task | Model |
|---|---|
| `js-async-cache` | `openrouter/recursive/flint-v1.0:free` |
| `js-pagination` | `openrouter/recursive/flint-v1.0:free` |
| `py-inventory-discount` | `opencode/beam-free` |
| `py-sql-injection` | `opencode/beam-free` |
| `py-todo-json` | `opencode/beam-free` |

Each task is still a same-model A/B pair. The aggregate table below mixes models and must not be read as a single-model result.

## Results

| Task | Model | Baseline | Treatment | Time (base / treat) | Steps (base / treat) | Diff (base / treat) |
|---|---|---|---:|---:|---:|---:|
| `js-async-cache` | flint free | pass | pass | 24s / 32s | 11 / 9 | 14+3− / 16+3− |
| `js-pagination` | flint free | pass | pass | 24s / 27s | 10 / 8 | 12+0− / 11+0− |
| `py-inventory-discount` | beam free | pass | pass | 32s / 9s | 15 / 6 | 1+1− / 1+1− |
| `py-sql-injection` | beam free | pass | pass | 68s / 13s | 10 / 7 | 6+2− / 4+2− |
| `py-todo-json` | beam free | pass | pass | 32s / 19s | 17 / 9 | 14+5− / 18+4− |

Aggregate:

| Config | Success | 95% CI | Median time | Median steps | Median tokens |
|---|---:|---:|---:|---:|---:|
| baseline (`build`) | 5/5 (100%) | 56.6%–100% | 31.6s | 11 | 84,097 |
| treatment (`fullstack-expert`) | 5/5 (100%) | 56.6%–100% | 19.3s | 8 | 87,186 |

Paired comparison: 5 ties, 0 baseline-only wins, 0 treatment-only wins, exact McNemar **p = 1.0000**.

## Interpretation

- **No win.** Both arms solved every task. There is no statistically significant difference.
- **Ceiling effect.** All five tasks are small, well-specified and solvable by the baseline model. A task set that both arms pass cannot separate them. Harder tasks are required before the benchmark can say anything about quality.
- **The speed/steps difference is suggestive, not evidence.** Treatment had a lower median time and step count, but with one run per cell a single slow or fast run flips it. It also used slightly *more* median tokens. Do not quote this as a speed advantage.
- **Mixed models.** The model changed mid-suite because free quotas ran out. This weakens the aggregate comparison; the per-task pairs remain valid.
- **Harness validity was the real finding.** The pilot exposed and fixed three validity bugs:
  1. Python `__pycache__` files were counted as test modifications.
  2. The agent could walk up from the run directory into `bench/tasks/<id>/hidden`.
  3. The agent could leave the run directory and edit the source fixture.
  All three are now blocked by the sandbox and ignore rules described in [README.md](README.md).

## Reproduce

```bash
cd bench

# One paired task on a model with quota
node run.mjs --model opencode/beam-free \
  --tasks py-inventory-discount --reps 1

# Analyze the results directory
node analyze.mjs results/pilot
```

To make the benchmark discriminating, add tasks that require multiple files, ambiguous requirements or specialist skills, then run with `--reps 3` or more on a **single** model.

## What this does not show

- It does not compare this system with Claude Code. That arm is blocked (see [README.md](README.md#claude-code)).
- It does not measure output quality beyond the hidden tests.
- It does not establish a token or cost advantage. Cost was $0 because the models were free.
