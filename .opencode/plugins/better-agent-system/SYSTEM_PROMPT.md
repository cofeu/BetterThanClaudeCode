# Better Agent System v3.4

Claude Fable 5.1's system prompt reorganized into **25 specialized agents**, **40 on-demand skills** and **9 slash commands**.

## Core idea

OpenCode already ships a strong base prompt (tools, permissions, editing). So v3 adds **no base prompt at all**. Each agent carries only a telegraphic domain brief (~120-170 tokens), and deep recipes live in skills that load **only when invoked**. Fixed cost is close to zero; depth is still available on demand.

> Config field is `system`, not `instructions`. In OpenCode v2.3 an `instructions` key is accepted silently but never reaches the model, so an agent would load with an empty prompt. `scripts/token-budget.mjs` rejects unknown agent keys to catch this class of bug.

| Approach | Fixed tokens per request |
|----------|--------------------------|
| Single mega-prompt | ~8,000+ |
| v2 distributed agents | ~350-550 |
| **v3 agents + on-demand skills** | **~667** (active agent + 40 descriptions) |

Skills are invoked automatically on trigger keywords, or explicitly by name. Their full content is paid for only on the turn it is used.

Descriptions are written as **discriminators**: `code-review` says "not system design", `architecture-review` says "not code diffs", `file-reading` says "not PDF or Office". Every agent prompt also carries "Skills: if two fit, load both", so multi-domain requests load both instead of guessing. Force a choice with `use skill <id>`.

## Shared behavior layer

Every agent inherits the same compact rule block (~45 tokens) adapted from `claude_behavior` in `claude-fable-5.1.md`: they
never repeat it in prose, so it costs once per request.

- After tool calls, answer the actual question in 1-2 sentences — never just "Done."
- Read before writing; smallest correct diff; no stubs or placeholders
- Run tests or a repro and verify output; never claim success from reading code
- Bash discipline: quote variables, `set -euo pipefail`, inspect before destructive commands
- Never invent paths, APIs, versions or numbers; say "unverified" when unsure
- Concise, additive output; ask only when ambiguity blocks progress

Every agent also points to the `elite-engineering` skill, which loads the full senior workflow (plan, code, bash, debug, verify, harden) only when needed.

Because only the active agent's `system` prompt loads, this costs ~45 tokens per request, not per agent.

## Agents (25)

All agents inherit the **session's active model** — no hardcoded models. Switch model once and every agent follows.

### Build (5)
| Agent | Focus |
|-------|-------|
| `frontend-expert` | React/Vue/Svelte, TS, CSS, a11y, Core Web Vitals |
| `backend-expert` | Node/Go/Python, DB, APIs, auth, messaging, observability |
| `fullstack-expert` | End-to-end features, shared contracts, monorepo, payments |
| `mobile-expert` | RN/Expo, Flutter, iOS/Android, KMP, store release |
| `devops-expert` | K8s, cloud, IaC, CI/CD, GitOps, observability |

### Analyze (4)
| Agent | Focus |
|-------|-------|
| `code-reviewer` | Correctness, security, perf, maintainability |
| `security-auditor` | OWASP, STRIDE, SAST/DAST, compliance |
| `performance-analyst` | Profiling, bottlenecks, measured optimization |
| `architect` | System design, ADRs, trade-offs, evolution |

### Deliver (4)
| Agent | Focus |
|-------|-------|
| `test-engineer` | Test pyramid, contract tests, quality gates |
| `docs-engineer` | API docs, ADRs, guides, docs-as-code |
| `release-engineer` | SemVer, changelogs, progressive rollout |
| `dependency-manager` | Updates, audits, licenses, SBOM |

### Specialized (7)
| Agent | Focus |
|-------|-------|
| `ai-ml-engineer` | LLMs, RAG, vector DBs, MLOps, evals |
| `data-engineer` | Warehouses, streaming, ELT, data quality |
| `data-scientist` | Stats, EDA, modeling, experiments |
| `database-expert` | Schema, indexing, query plans, migrations |
| `game-dev` | Unity/Godot/Unreal, graphics, netcode |
| `embedded-engineer` | Firmware, RTOS, MCUs, OTA |
| `api-designer` | Contracts, versioning, DX |

### Lead (5)
| Agent | Focus |
|-------|-------|
| `tech-lead` | Decompose, delegate, review, integrate |
| `sre` | SLOs, incidents, observability, capacity |
| `qa-automation` | CI gating, flake triage, automation |
| `prompt-engineer` | Prompt design, eval, cost/latency |
| `product-manager` | PRDs, stories, prioritization, metrics |

`default_agent`: `fullstack-expert`

All 25 agents use `mode: "all"`: they appear in the agent picker **and** can be delegated to as subagents, so `tech-lead` can parallelize non-overlapping work. Each agent also sets `steps` — reviewers and analysts get 8-12 iterations, builders 16-20, `fullstack-expert` and `tech-lead` 24 — to cap runaway loops.

## Permissions

Read-only agents (`code-reviewer`, `security-auditor`, `performance-analyst`, `architect`) deny `edit`: they report findings instead of silently changing code. Test agents (`test-engineer`, `qa-automation`) may only edit test paths (`**/*.test.*`, `**/*.spec.*`, `**/tests/**`, `**/e2e/**`, …).

Global shell rules sit in `permissions` and are evaluated last-match-wins:

| Pattern | Effect |
|---------|--------|
| `rm -rf /`, `rm -rf /*` | deny |
| `rm -rf *`, `git push --force*`, `git reset --hard*` | ask |
| `sudo *`, `dd *`, `mkfs*` | ask |
| `curl`/`wget` piped to `sh` or `bash` | ask |

## Commands (9)

Global slash commands live in `.opencode/commands/` and install to `~/.config/opencode/commands/`. The template body loads only when the command runs, so fixed cost is zero.

| Command | Agent | Purpose |
|---------|-------|---------|
| `/verify [path]` | test-engineer | Detect stack; run format, lint, typecheck, tests, build |
| `/review [diff]` | code-reviewer (subagent) | Severity-ordered findings with concrete fixes |
| `/debug <error>` | fullstack-expert | Reproduce, minimize, isolate, fix, regression test |
| `/ship [version]` | release-engineer | Changelog, gates, rollout and tested rollback |
| `/onboard [path]` | tech-lead | Map repo and write AGENTS.md |
| `/incident <sym>` | sre | Stabilize, timeline, blameless postmortem |
| `/research <topic>` | tech-lead | Dated, primary-source research with conflicts and gaps |
| `/prd <feature>` | product-manager | Problem, stories, acceptance criteria, metrics |
| `/browse <url>` | frontend-expert | Open a page, inspect console/network, screenshot, verify a UI change |

Commands never pin a model, so they follow the session's active model.

## Skills (40, auto-invoke)

Every skill referenced by an agent exists in the plugin.

| Skill | Triggers |
|-------|----------|
| `elite-engineering` | non-trivial code, bash, debug, verify |
| `code-review` | review, PR review |
| `security-audit` | security, audit, CVE |
| `performance-profile` | slow, performance, optimize |
| `architecture-review` | architecture, design, ADR |
| `test-generation` | test, TDD, coverage |
| `docs-generation` | docs, README, API docs |
| `dependency-check` | dependencies, outdated, SBOM |
| `release-prep` | release, version, deploy |
| `frontend-deep` | UI, rendering, a11y |
| `backend-deep` | endpoint, API, data model |
| `fullstack-deep` | full feature, schema to UI |
| `devops-deep` | infra, pipeline, K8s |
| `mobile-deep` | app, device, store |
| `db-deep` | query, migration, index |
| `ai-ml` | LLM, RAG, embeddings |
| `data-science` | analysis, statistics, A/B |
| `data-pipeline` | ETL, warehouse, dbt |
| `incident-response` | outage, alert, SLO |
| `api-contract` | contract, versioning, OpenAPI |
| `prompt-optimize` | prompt, eval, tokens |
| `prd-writer` | PRD, user story, roadmap |
| `tech-lead` | plan, coordinate, delegate |
| `game-deep` | gameplay, engine, netcode |
| `embedded-deep` | firmware, peripheral, OTA |
| `pdf` | PDF, merge, split, fill, encrypt, OCR |
| `pdf-reading` | read PDF, extract table, summarize |
| `docx` | Word, .docx, report, memo, letter |
| `pptx` | PowerPoint, .pptx, slide deck |
| `xlsx` | Excel, .xlsx, CSV, formula, pivot |
| `file-reading` | read this file, uploaded file |
| `frontend-design` | make it look good, landing page, dashboard |
| `deep-research` | research, compare, latest, current |
| `skill-authoring` | add a skill, token budget |
| `repo-onboarding` | new repo, onboard, where do I start |
| `verify` | verify, is this done, before claiming done |
| `git-workflow` | branch, rebase, conflict, bisect, revert |
| `untrusted-content` | web page, fetched URL, issue text, prompt injection |
| `language-playbooks` | idiomatic TS/Python/Go/Rust |
| `browser-deep` | browser, UI check, console, network, DevTools, Lighthouse |

## Token budget guard

`scripts/token-budget.mjs` parses both `opencode.jsonc` and `src/index.ts`, then enforces:

| Budget | Limit |
|--------|-------|
| Agent system prompt | ≤ 180 tok |
| Skill description | ≤ 18 tok |
| All descriptions | ≤ 500 tok |
| Fixed per request | ≤ 700 tok |
| Single skill body | ≤ 1,400 tok |

```bash
cd .opencode/plugins/better-agent-system
npm run check:tokens        # human report, exit 1 on violation
npm run check:tokens:json   # machine-readable report
```

It also fails on missing skill references, duplicate IDs or descriptions, hardcoded agent models, unsupported agent keys (e.g. `instructions` instead of `system`), and agents without a system prompt. The plugin repeats the same check at startup and warns in the log.

## Runtime token controls

The 647 figure is only what this system adds. Most tokens in a long session come from tool output and history, so `opencode.jsonc` also caps them:

```jsonc
"tool_output": { "max_lines": 500, "max_bytes": 20480 },
"compaction": { "auto": true, "keep": { "tokens": 12000 } }
```

| Control | Effect |
|---------|--------|
| `tool_output.max_lines/bytes` | Large reads and command output are truncated to disk instead of flooding context (defaults: 2000 lines / 50 KB) |
| `compaction.auto` + `keep.tokens` | Old turns are summarized once the window fills, keeping ~12k recent tokens verbatim |
| `agents.<id>.steps` (optional) | Caps agentic iterations per turn |

Levers that do **not** help: shortening skill bodies (they are on-demand), adding more agents (only the active one loads), or disabling auto-invoke (descriptions are what trigger the skill).

Levers that do: smaller tool outputs, earlier compaction, fewer subagent round-trips, and provider prompt caching where the provider supports it.

## Global install

Agents only exist where their config exists. This repository's `opencode.jsonc` and `.opencode/plugins/` are project-local, so another project sees none of them. To make the system available everywhere:

```bash
cd .opencode/plugins/better-agent-system
npm run install:global
opencode reload
```

The script:

1. copies the plugin to `~/.config/opencode/plugins/better-agent-system`
2. merges `agents` (25), `default_agent`, `tool_output`, `compaction` and `permissions` into `~/.config/opencode/opencode.json`, preserving other keys such as `mcp`
3. copies slash commands to `~/.config/opencode/commands`
4. links the document venv so the pdf/docx/pptx/xlsx skills work in every project

Re-run it after editing agents or skills. Project config still wins over global config for values it sets, so a project can override any agent.

## Files

- `opencode.jsonc` — agent definitions (25), modes, steps, permissions; the install source
- `.opencode/plugins/better-agent-system/src/index.ts` — skill registration (40)
- `.opencode/commands/` — slash command sources (8)
- `.opencode/plugins/better-agent-system/scripts/token-budget.mjs` — token guard
- `.opencode/plugins/better-agent-system/scripts/install-global.sh` — global installer
- `.opencode/plugins/better-agent-system/scripts/setup-docs.sh` — installs `.venv-docs` (pypdf, pdfplumber, reportlab, python-docx, python-pptx, openpyxl, pandas)


## Usage

1. Reload OpenCode Desktop (`Ctrl+P` → Reload Configuration, or restart).
2. Pick a model once — all agents use it.
3. Pick an agent from the top-left dropdown.
4. Talk normally; matching skills auto-invoke, or say "use skill `db-deep`".

Examples:
> "Review my last changes" → code-review
> "This query is slow" → performance-profile + db-deep
> "Plan this feature across backend and UI" → tech-lead → fullstack-deep
