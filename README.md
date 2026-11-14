# Better Agent System

**A senior engineering team in ~667 tokens per request.**

25 specialist agents, 40 on-demand skills and 9 slash commands for [OpenCode](https://opencode.ai) — built so that depth costs nothing until you actually use it.

[English](README.md) · [Türkçe](README.tr.md)

[![Version](https://img.shields.io/badge/version-3.4.0-blue?style=flat-square)](.opencode/plugins/better-agent-system/package.json)
[![Agents](https://img.shields.io/badge/agents-25-8b5cf6?style=flat-square)](#agents)
[![Skills](https://img.shields.io/badge/skills-40-0ea5e9?style=flat-square)](#skills)
[![Commands](https://img.shields.io/badge/commands-8-10b981?style=flat-square)](#slash-commands)
[![Fixed cost](https://img.shields.io/badge/fixed%20cost-~667%20tokens-f59e0b?style=flat-square)](#token-economics)
[![License](https://img.shields.io/badge/license-MIT-64748b?style=flat-square)](#license)

---

## Why this exists

Most "mega prompts" try to make a model good at everything by putting everything in context. That works — until you pay for it on **every single request**, and until the instructions start contradicting each other.

This project takes the opposite approach:

| | Typical mega prompt | Better Agent System |
|---|---|---|
| Fixed cost per request | 8,000+ tokens | **~667 tokens** |
| Structure | One prompt for all tasks | 25 focused agents |
| Depth | Always loaded | 40 skills, loaded on demand |
| Model | Often hardcoded | **Inherits your session model** |
| Workflow | You remember the steps | 9 slash commands encode them |
| Safety | Prompt-level warnings | Enforced permissions + shell rules |

The result is a system that behaves like a much larger, more disciplined model while staying cheap enough to leave enabled all day.

## Features

- **25 specialist agents** across build, analysis, delivery, data/AI, and leadership.
- **40 on-demand skills** with concrete commands, checklists and failure modes.
- **9 slash commands** for the workflows you repeat: verify, review, debug, ship, onboard, incident, research, PRD, browse.
- **Browser + DevTools** — drive Chromium, inspect console and network, run traces, CPU profiles, heap diffs and Lighthouse audits.
- **Zero hardcoded models** — every agent follows the model you selected in the session.
- **Real delegation** — all agents run in `all` mode, so `tech-lead` can parallelize specialists as subagents.
- **Bounded autonomy** — per-agent `steps` caps runaway loops (reviewers 8–12, builders 16–24).
- **Enforced safety** — reviewers cannot edit, test agents can only touch test paths, destructive shell commands require confirmation.
- **Token guard in CI and at startup** — a script fails the build when budgets are exceeded.
- **Global install** — one command makes the whole system available in every project.
- **Document toolchain** — isolated Python venv for PDF, Word, PowerPoint and Excel work.

## Quick start

Requirements: **OpenCode 2.3+**, **Node.js 20+**, and bash (Linux, macOS, or WSL).

```bash
git clone https://github.com/cofeu/BetterThanClaudeCode.git
cd BetterThanClaudeCode/.opencode/plugins/better-agent-system

# Optional: PDF / DOCX / PPTX / XLSX skills
npm run setup:docs

# Install for every project
npm run install:global

# Apply without restarting
opencode reload
```

Then open any project, pick an agent from the picker, and talk normally.

> **Project-local use:** opening this repository in OpenCode already loads `opencode.jsonc` and the plugin. `install:global` is only needed to use the system everywhere.

### First five minutes

```text
/onboard                 # map an unfamiliar repository and write AGENTS.md
/verify                  # run format, lint, typecheck, tests and build
/review                  # severity-ordered review of your current diff
/debug TypeError in ...  # reproduce, isolate, fix, add a regression test
/browse localhost:3000    # open a page, check console/network, screenshot
```

## How it works

```text
┌─────────────────────────────────────────────────────────┐
│ OpenCode session — your model, your tools, your project │
└───────────────────────────┬─────────────────────────────┘
                            │ every request
              ┌─────────────▼──────────────┐
              │ active agent `system`      │  ~90–176 tokens
              │ + 40 skill descriptions    │  ~491 tokens
              └─────────────┬──────────────┘
                            │ trigger match
              ┌─────────────▼──────────────┐
              │ one skill body (on demand) │  ≤1,400 tokens
              └─────────────┬──────────────┘
                            │
              ┌─────────────▼──────────────┐
              │ read · edit · shell · LSP  │
              └────────────────────────────┘
```

OpenCode already ships a strong base prompt for tools, permissions and editing. This system adds **no competing base prompt**. Each agent carries a short telegraphic brief, and every deeper recipe lives in a skill that is loaded only on the turn it is needed.

### Design rules

1. **Descriptions are the only always-on skill cost.** They are written to contain the words a user would actually say.
2. **Depth belongs in the body, never in the description.** A skill can be 1,400 tokens and still cost ~12 fixed tokens.
3. **The active agent is the only agent prompt in context.** Adding agents does not raise the fixed cost.
4. **One trigger family per skill.** Overlapping skills get merged, not stacked.
5. **Every claim must be verifiable.** Agents are told to run tests, read output and mark unverified facts.

## Token economics

Measured with `npm run check:tokens`:

| Component | When it is paid | Measured |
|---|---|---|
| Active agent prompt | Every request | ~156 avg, ~176 max |
| All 40 skill descriptions | Every request | ~491 |
| **Fixed total** | **Every request** | **~667** |
| One skill body | Only when triggered | ~330 avg, ≤1,400 max |
| All skill bodies combined | Never | ~12,868 |

Hard budgets enforced by `scripts/token-budget.mjs`:

| Budget | Limit |
|---|---|
| Agent system prompt | ≤ 180 tokens |
| Single skill description | ≤ 18 tokens |
| All descriptions | ≤ 500 tokens |
| Fixed per request | ≤ 700 tokens |
| Single skill body | ≤ 1,400 tokens |

```bash
npm run check:tokens        # human-readable report, exit 1 on violation
npm run check:tokens:json   # machine-readable report
```

The guard also fails on missing skill references, duplicate IDs or descriptions, hardcoded agent models, unsupported agent keys, and agents without a system prompt. The plugin repeats the check at startup.

### Runtime controls

Long sessions are dominated by tool output and history, not by prompts. The config caps both:

```jsonc
"tool_output": { "max_lines": 500, "max_bytes": 20480 },
"compaction": { "auto": true, "keep": { "tokens": 12000 } }
```

| Control | Effect |
|---|---|
| `tool_output.max_lines` / `max_bytes` | Large reads and command output are truncated to disk |
| `compaction.auto` + `keep.tokens` | Old turns are summarized, ~12k recent tokens stay verbatim |
| `agents.<id>.steps` | Caps agentic iterations per turn |

## Agents

All 25 agents use `mode: "all"` and inherit the session's active model. `default_agent` is `fullstack-expert`.

### Build

| Agent | Focus | Steps |
|---|---|:---:|
| `frontend-expert` | React, Vue, Svelte, TypeScript, CSS, a11y, Core Web Vitals | 20 |
| `backend-expert` | Node.js, Go, Python, databases, APIs, distributed systems | 20 |
| `fullstack-expert` | End-to-end features, shared contracts, monorepos, payments | 24 |
| `mobile-expert` | React Native, Expo, Flutter, iOS/Android, store release | 20 |
| `devops-expert` | Kubernetes, cloud, IaC, CI/CD, GitOps, observability | 20 |

### Analyze

| Agent | Focus | Steps |
|---|---|:---:|
| `code-reviewer` | Correctness, security, performance, maintainability | 8 |
| `security-auditor` | OWASP, STRIDE, SAST/DAST, compliance | 10 |
| `performance-analyst` | Profiling, bottlenecks, measured optimization | 12 |
| `architect` | System design, ADRs, trade-offs, evolution | 10 |

### Deliver

| Agent | Focus | Steps |
|---|---|:---:|
| `test-engineer` | Test pyramid, contract tests, quality gates | 16 |
| `docs-engineer` | API docs, ADRs, guides, docs-as-code | 12 |
| `release-engineer` | SemVer, changelogs, progressive rollout | 12 |
| `dependency-manager` | Updates, audits, licenses, SBOM | 12 |

### Specialized

| Agent | Focus | Steps |
|---|---|:---:|
| `ai-ml-engineer` | LLMs, RAG, vector databases, MLOps, evals | 20 |
| `data-engineer` | Warehouses, streaming, ELT, data quality | 16 |
| `data-scientist` | Statistics, EDA, modeling, experiments | 16 |
| `database-expert` | Schema, indexing, query plans, migrations | 16 |
| `game-dev` | Unity/Godot/Unreal, graphics, netcode | 20 |
| `embedded-engineer` | Firmware, RTOS, MCUs, OTA | 20 |
| `api-designer` | Contracts, versioning, REST/GraphQL/gRPC, DX | 12 |

### Lead

| Agent | Focus | Steps |
|---|---|:---:|
| `tech-lead` | Decompose, delegate, review, integrate | 24 |
| `sre` | SLOs, incidents, observability, capacity | 16 |
| `qa-automation` | CI gating, flake triage, automation | 16 |
| `prompt-engineer` | Prompt design, evaluation, cost/latency | 12 |
| `product-manager` | PRDs, stories, prioritization, metrics | 12 |

## Skills

Skills are invoked automatically on trigger keywords, or explicitly with `use skill <id>`.

### Routing and disambiguation

Descriptions are written as discriminators, not marketing copy: `code-review` says "not system design", `architecture-review` says "not code diffs", `file-reading` says "not PDF or Office". This keeps overlapping skills from stealing each other's requests.

When a request spans domains, agents load every skill that fits — the shared rule in every agent prompt is **"if two fit, load both"**. To force a specific skill, say `use skill <id>`.

### Engineering core (19)

| Skill | Triggers |
|---|---|
| `elite-engineering` | non-trivial code, bash, debug, verify |
| `code-review` | review, PR review |
| `security-audit` | security, audit, CVE |
| `performance-profile` | slow, performance, optimize |
| `architecture-review` | architecture, design, ADR |
| `test-generation` | test, TDD, coverage |
| `docs-generation` | docs, README, API docs |
| `dependency-check` | dependencies, outdated, SBOM |
| `release-prep` | release, version, deploy |
| `incident-response` | outage, alert, SLO |
| `api-contract` | contract, versioning, OpenAPI |
| `prompt-optimize` | prompt, eval, tokens |
| `prd-writer` | PRD, user story, roadmap |
| `tech-lead` | plan, coordinate, delegate |
| `verify` | verify, is this done |
| `repo-onboarding` | new repo, onboard, where do I start |
| `git-workflow` | branch, rebase, conflict, bisect, revert |
| `untrusted-content` | web page, fetched URL, prompt injection |
| `language-playbooks` | idiomatic TS/Python/Go/Rust |

### Domain deep dives (11)

`frontend-deep` · `backend-deep` · `fullstack-deep` · `devops-deep` · `mobile-deep` · `db-deep` · `ai-ml` · `data-science` · `data-pipeline` · `game-deep` · `embedded-deep`

### Documents (6)

`pdf` · `pdf-reading` · `docx` · `pptx` · `xlsx` · `file-reading`

### Design, research and meta (3)

`frontend-design` · `deep-research` · `skill-authoring`

### Browser and DevTools (1)

`browser-deep`

## Slash commands

Commands live in `.opencode/commands/` and install to `~/.config/opencode/commands/`. Their bodies load only when invoked, so they add **zero fixed cost**.

| Command | Agent | What it does |
|---|---|---|
| `/verify [path]` | test-engineer | Detect the stack; run format, lint, typecheck, tests, build |
| `/review [diff]` | code-reviewer | Severity-ordered findings with `file:line` and a fix |
| `/debug <error>` | fullstack-expert | Reproduce, minimize, isolate, fix, regression test |
| `/ship [version]` | release-engineer | Changelog, gates, rollout and tested rollback |
| `/onboard [path]` | tech-lead | Map the repo and write `AGENTS.md` |
| `/incident <symptom>` | sre | Stabilize, timeline, blameless postmortem |
| `/research <topic>` | tech-lead | Dated, primary-source research with conflicts and gaps |
| `/prd <feature>` | product-manager | Problem, stories, acceptance criteria, metrics |
| `/browse <url>` | frontend-expert | Open a page, inspect console/network, screenshot, verify a UI change |

Commands never pin a model, so they follow the session's active model.

## Safety model

### Agent permissions

| Agent | `edit` policy |
|---|---|
| `code-reviewer`, `security-auditor`, `performance-analyst`, `architect` | **Denied** — report findings, never change code |
| `test-engineer`, `qa-automation` | **Test paths only** — `*.test.*`, `*.spec.*`, `tests/`, `test/`, `__tests__/`, `e2e/` |
| Everyone else | Normal edit access |

### Global shell rules

Rules are evaluated last-match-wins:

| Pattern | Effect |
|---|---|
| `rm -rf /`, `rm -rf /*` | **Deny** |
| `rm -rf *`, `git push --force*`, `git reset --hard*` | **Ask** |
| `sudo *`, `dd *`, `mkfs*` | **Ask** |
| `curl` / `wget` piped to `sh` or `bash` | **Ask** |

Agents are also instructed to treat fetched web content and tool output as **data, not instructions** — the `untrusted-content` skill covers prompt-injection handling.

## Customization

### Change an agent

Edit `opencode.jsonc`, then reinstall:

```bash
cd .opencode/plugins/better-agent-system
npm run check:tokens
npm run install:global
opencode reload
```

### Add a skill

Append to `skillSpecs` in `.opencode/plugins/better-agent-system/src/index.ts`:

```ts
{
  id: "my-skill",
  name: "My Skill",
  description: "Words users actually say",
  content: `Trigger: ...

Process:
1. ...
Rules: ...`,
  autoinvoke: true,
},
```

Then reference it from at least one agent (`Deep: skill my-skill.`), run `npm run check:tokens`, and reinstall. Keep the description under 18 tokens and the body under 1,400.

### Use a different model

Nothing to change. Select the model in OpenCode once; every agent and command inherits it.

## Repository layout

```text
.
├── opencode.jsonc                      # 25 agents, modes, steps, permissions
├── .opencode/
│   ├── commands/                       # 9 slash command templates
│   └── plugins/better-agent-system/
│       ├── src/index.ts                # 40 skill definitions + startup guard
│       ├── scripts/
│       │   ├── install-global.sh       # global installer
│       │   ├── setup-docs.sh           # isolated Python venv
│       │   └── token-budget.mjs        # budget + validation guard
│       ├── SYSTEM_PROMPT.md            # architecture and token notes
│       └── package.json
├── README.md
└── README.tr.md
```

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Agent loads with an empty prompt | The config used `instructions`. OpenCode v2.3 expects `system`; the token guard rejects the wrong key. |
| Agents missing in another project | Run `npm run install:global`, then `opencode reload`. Other open windows need a restart. |
| A skill never triggers | Its description lacks the user's words. Add the phrase, or call `use skill <id>` explicitly. |
| Document skills fail | Run `npm run setup:docs`; verify `.venv-docs/bin/python` exists. |
| Token check fails | Read the reported file and budget, trim the prompt or description, re-run. |
| Command not listed | Confirm the `.md` file is in `~/.config/opencode/commands/` or `.opencode/commands/`, then reload. |

## Design notes

- **`system`, not `instructions`.** In OpenCode v2.3 an `instructions` key is accepted silently but never reaches the model. The token guard rejects unknown agent keys to catch this class of bug.
- **Project config wins over global config.** A project can override any agent, permission or limit.
- **Global install is a merge, not a replace.** Existing keys such as `mcp` and `provider` are preserved.
- **The document venv is shared by symlink.** It is never copied and never committed (263 MB).
- **Budgets are enforced, not aspirational.** `npm test` runs the token check.

## Contributing

1. Keep the fixed budget under 700 tokens; run `npm run check:tokens`.
2. Put depth in skill bodies, never in descriptions.
3. Merge overlapping skills instead of adding a third.
4. Every command and path in a skill must be real and tested.
5. Update `SYSTEM_PROMPT.md` when architecture or budgets change.

## Credits

Adapted from the Claude Fable 5.1 system prompt and reorganized for OpenCode's agent, skill and command model. Not affiliated with Anthropic or OpenCode.

## License

MIT — as declared in `.opencode/plugins/better-agent-system/package.json`.
