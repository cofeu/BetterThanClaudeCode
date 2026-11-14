# Benchmark

A small, reproducible A/B benchmark for the Better Agent System.

It answers one narrow question:

> On the same model, same tasks and same starting code, does this system complete verifiable engineering tasks more reliably than OpenCode's default `build` agent?

It does **not** answer whether this system is better than Claude Code. That requires a head-to-head run with Claude Code, which is a separate third arm (see [Claude Code](#claude-code)).

## What is measured

| Metric | How |
|---|---|
| Success | Agent exit 0, no provider errors, visible tests pass, hidden tests pass, tests untouched |
| Wall clock | Time from process start to exit |
| Cost | Sum of `step_finish.part.cost` from `opencode run --format json` |
| Tokens | Input + output + reasoning + cache write/read from the same events |
| Steps / tool calls | Event counts |
| Diff size | `git diff --cached --numstat` after the run |

## Fairness rules

- **Same model** for every arm (`--model`). Each task is a paired A/B run on one model.
- **Same task prompt** and same starting commit.
- **Fresh directory** per run, created under `/tmp/opencode-bench/`, never inside this repository.
- **Isolated config** for the baseline: `XDG_CONFIG_HOME=/tmp/opencode-bench-config`, which contains only `{}`. The baseline therefore has the built-in agents and no custom skills.
- Treatment uses the normal global config (`~/.config/opencode`).
- `--standalone` is mandatory: it prevents the desktop/background server from leaking its agents into the baseline.
- Hidden tests are copied into the run directory **after** the agent exits. The agent never sees them.
- Tests are hashed before and after; a run that edits `tests/` is marked failed. Cache artifacts (`__pycache__/`, `*.pyc`, `.pytest_cache/`, `node_modules/`) are ignored in that hash.
- No network-dependent tasks. Python uses `unittest`; Node uses `node --test`.

## Sandboxing (required for valid results)

An agent will happily walk up from its working directory and edit anything it can read. Early runs proved this: the agent found the benchmark's **source fixture** under `bench/tasks/<id>/repo/` and edited that instead of the run copy, producing a false result. Copying the repo to a temp directory is not enough, because the source tree is still reachable.

Every run is therefore wrapped in [`bubblewrap`](https://github.com/containers/bubblewrap) (`bwrap`):

```bash
bwrap --ro-bind / / --dev /dev --proc /proc --unshare-pid --die-with-parent \
  --bind /tmp /tmp \
  --tmpfs /tmp/opencode \
  --tmpfs <repo-root> \
  --tmpfs ~/.local/share/opencode \
  --tmpfs ~/.local/state/opencode \
  --chdir <run-dir> -- opencode run --standalone ...
```

This hides the benchmark repository, previous sessions and hidden tests, while leaving the run directory writable. Each run also gets a fresh `XDG_DATA_HOME` and `XDG_STATE_HOME` containing only a copy of `auth.json`, so an agent cannot read another run's session or its hidden tests.

`--no-sandbox` exists for debugging, but results produced with it are **invalid**: the agent can escape into the source fixtures and the OpenCode session database. Do not publish unsandboxed numbers.

`bwrap` is Linux-only. On other platforms the runner refuses to claim a valid run; use a container or a Linux VM instead.

## Quick start

```bash
cd bench

# 1. See the plan without spending anything
node run.mjs --dry-run

# 2. Pilot: 1 task, 1 repetition per arm
node run.mjs --tasks py-inventory-discount --reps 1

# 3. Full suite (5 tasks x 2 arms x 3 reps = 30 runs)
node run.mjs --reps 3

# 4. Re-analyze an existing run
node analyze.mjs results/<timestamp>
```

Useful flags:

```bash
node run.mjs --model google/gemini-3.6-flash
node run.mjs --timeout 600
node run.mjs --configs baseline
node run.mjs --tasks py-inventory-discount,js-async-cache
node run.mjs --out /tmp/my-bench
```

Results go to `bench/results/<timestamp>/`:

```
runs/<task>/<arm>/rep-<n>/
  repo/            # final working tree (inspectable)
  events.jsonl     # raw OpenCode events
  diff.patch       # agent's diff
  visible.txt      # visible test output
  hidden.txt       # hidden test output
  result.json      # normalized result
summary.md
summary.json
```

### Free-model quota

Paid providers were unavailable while this was written (see [Claude Code](#claude-code)), so the pilot used free models. Free tiers are rate-limited per provider and per day:

- `opencode/longcat-2.5-free` — hit *Free usage limit reached* mid-suite.
- `openrouter/*:free` — hit *free-models-per-day* after a few runs.
- `opencode/beam-free` — still worked at the time of writing.

When a quota runs out the run is recorded as **invalid** (`agentExitCode != 0` or an `errors` entry) and excluded from the success rate. Re-run the task on a model with quota; keep both arms of a task on the **same** model. A full suite with `--reps 3` on free models will usually need several days or a paid key.

## Tasks

| Task | Kind | Checks |
|---|---|---|
| `py-inventory-discount` | bug fix | discount boundary at exactly 100.00 |
| `js-async-cache` | bug fix | in-flight dedupe, rejection not cached |
| `py-todo-json` | feature | `--json` output schema for `add` and `list` |
| `js-pagination` | feature | `limit`/`offset` defaults, bounds, validation |
| `py-sql-injection` | security fix | parameterized query, apostrophes still work |

Each task has:

- `task.md` — what the agent reads
- `repo/` — starting code and visible tests
- `hidden/` — tests copied in only after the agent exits
- `task.json` — visible/hidden commands and timeout

## Reading the results

`summary.md` reports success rate with a Wilson 95% interval, median time/cost/tokens, per-task results and a paired McNemar test.

Small runs are pilots, not proof. With 3 repetitions per cell, a difference of one or two tasks is noise. Treat the benchmark as evidence only when:

- the same task set and model are used,
- the number of runs is large enough to make the interval meaningful,
- and the raw run directories are published alongside the summary.

## Pilot result (2026-11-14)

The first run is documented in [PILOT.md](PILOT.md). Summary:

- 5 tasks x 2 arms x 1 repetition = **10 runs**, all on free models (`opencode/beam-free`, `openrouter/recursive/flint-v1.0:free`).
- Both arms passed **5/5** tasks. Exact McNemar p = 1.0000, so there is **no statistically significant difference**.
- Treatment was faster (median 19.3s vs 31.6s) and used fewer steps (median 8 vs 11), but with n=1 per cell this is not evidence of a general speed advantage.
- The result is a **ceiling effect**: all five tasks are within reach of the baseline model, so the task set cannot separate the two systems.

This is a working harness plus an honest null result, not a win. To make the benchmark discriminating, add harder tasks (multi-file changes, ambiguous requirements, tasks that need the specialist skills) and run with `--reps 3+` on a single model.

## Claude Code

Claude Code is installed on this machine (`claude --version`), but both Claude Code and the Anthropic API currently return:

```
Credit balance is too low
```

So a fair Claude Code arm is blocked until credits are added. When they are, add a third arm that runs:

```bash
claude -p "$PROMPT" --model sonnet --output-format json --permission-mode bypassPermissions
```

in the same task directory, then normalize its JSON (`total_cost_usd`, `duration_ms`, `num_turns`, `is_error`) into the same `result.json` shape. Do not compare different models and call it a system comparison.

## Adding a task

1. Create `tasks/<id>/repo/` with the starting code and visible tests.
2. Create `tasks/<id>/hidden/` with tests that check behavior, not implementation.
3. Write `task.md` with the exact required behavior.
4. Add `task.json`:

```json
{
  "id": "my-task",
  "language": "python",
  "prompt": "Read TASK.md and complete it. Run the visible tests. Do not modify anything under tests/.",
  "visible": "python3 -m unittest discover -s tests -t . -v",
  "hidden": "python3 -m unittest discover -s tests_hidden -t . -v",
  "timeoutSec": 300
}
```

Notes that cost real debugging time:

- Node: `node --test tests/` does **not** work on Node 24 (it treats `tests` as a module). Use `node --test tests/*.test.js` and `node --test tests_hidden/*.test.js`.
- Python: `unittest discover -s tests -t .` requires `tests/__init__.py` (and `tests_hidden/__init__.py`) or it raises `Start directory is not importable`.
- Validate every task before running the benchmark: visible tests must pass on the starter, hidden tests must fail on the starter, and hidden tests must pass after a reference fix.

5. Run `node run.mjs --tasks my-task --reps 1` and inspect the raw output.
