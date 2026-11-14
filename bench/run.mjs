#!/usr/bin/env node
// Run the A/B benchmark. No external dependencies.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import crypto from "node:crypto"
import { spawn, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { writeSummary } from "./analyze.mjs"

const BENCH_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.dirname(BENCH_DIR)
const TASKS_DIR = path.join(BENCH_DIR, "tasks")
const RESULTS_DIR = path.join(BENCH_DIR, "results")
// Keep the baseline config outside the repository: the sandbox hides the repo.
const BASELINE_XDG = path.join(os.tmpdir(), "opencode-bench-config")
const WORK_ROOT = path.join(os.tmpdir(), "opencode-bench")

function hasBwrap() {
  try {
    return spawnSync("bwrap", ["--version"], { stdio: "ignore" }).status === 0
  } catch {
    return false
  }
}

const DEFAULTS = {
  model: process.env.BENCH_MODEL || "google/gemini-3.6-flash",
  reps: 1,
  timeoutSec: 300,
  baselineAgent: "build",
  treatmentAgent: "fullstack-expert",
  tasks: "all",
  configs: "baseline,treatment",
  dryRun: false,
  sandbox: process.platform === "linux" && hasBwrap(),
  noSandbox: false,
  help: false,
}

function usage() {
  return `Usage: node run.mjs [options]

  --model <id>              Model for every arm (default: ${DEFAULTS.model})
  --reps <n>                Repetitions per task/arm (default: 1)
  --timeout <seconds>       Per-run timeout (default: 300)
  --tasks <id,id|all>       Tasks to run (default: all)
  --configs <baseline,treatment>
  --baseline-agent <id>     Default: build
  --treatment-agent <id>    Default: fullstack-expert
  --out <dir>               Results directory
  --dry-run                 Print the plan, run nothing
  --no-sandbox              Run the agent without bubblewrap (Linux only)
  --help

Environment:
  BENCH_MODEL               Default model when --model is omitted
`
}

function parseArgs(argv) {
  const opts = { ...DEFAULTS }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${arg} needs a value`)
      return argv[++i]
    }
    switch (arg) {
      case "--model": opts.model = next(); break
      case "--reps": opts.reps = Number(next()); break
      case "--timeout": opts.timeoutSec = Number(next()); break
      case "--tasks": opts.tasks = next(); break
      case "--configs": opts.configs = next(); break
      case "--baseline-agent": opts.baselineAgent = next(); break
      case "--treatment-agent": opts.treatmentAgent = next(); break
      case "--out": opts.out = next(); break
      case "--dry-run": opts.dryRun = true; break
      case "--no-sandbox": opts.sandbox = false; opts.noSandbox = true; break
      case "--help": opts.help = true; break
      default: throw new Error(`Unknown option: ${arg}`)
    }
  }
  if (!Number.isInteger(opts.reps) || opts.reps < 1) throw new Error("--reps must be a positive integer")
  if (!Number.isFinite(opts.timeoutSec) || opts.timeoutSec < 10) throw new Error("--timeout must be at least 10 seconds")
  return opts
}

function loadTasks(selection) {
  const all = fs
    .readdirSync(TASKS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  const ids = selection === "all" ? all : selection.split(",").map((id) => id.trim()).filter(Boolean)
  for (const id of ids) {
    if (!all.includes(id)) throw new Error(`Unknown task: ${id}`)
  }
  return ids.map((id) => {
    const dir = path.join(TASKS_DIR, id)
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "task.json"), "utf8"))
    return {
      ...manifest,
      id,
      dir,
      repoDir: path.join(dir, "repo"),
      hiddenDir: path.join(dir, "hidden"),
    }
  })
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-")
}

function ensureBaselineConfig() {
  const dir = path.join(BASELINE_XDG, "opencode")
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, "opencode.json"), "{}\n")
}

function benchEnv(config, { dataHome, stateHome } = {}) {
  const env = { ...process.env }
  // The desktop sets these. They can attach the CLI to the current session or UI.
  for (const key of [
    "OPENCODE_SESSION_ID",
    "OPENCODE_CLIENT",
    "OPENCODE_TERMINAL",
    "CHROME_DESKTOP",
    "AI_AGENT",
    "OPENCODE",
  ]) {
    delete env[key]
  }
  env.XDG_CONFIG_HOME =
    config === "baseline" ? BASELINE_XDG : path.join(os.homedir(), ".config")
  if (dataHome) env.XDG_DATA_HOME = dataHome
  if (stateHome) env.XDG_STATE_HOME = stateHome
  env.NO_COLOR = "1"
  env.CI = "1"
  return env
}

function killTree(child) {
  try {
    process.kill(-child.pid, "SIGTERM")
  } catch {
    // already gone
  }
  const timer = setTimeout(() => {
    try {
      process.kill(-child.pid, "SIGKILL")
    } catch {
      // already gone
    }
  }, 3000)
  timer.unref?.()
}

function runProcess(command, args, { cwd, env = process.env, timeoutMs = 120000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    let timedOut = false
    let settled = false
    let finish

    const timer = setTimeout(() => {
      timedOut = true
      killTree(child)
      const hardTimer = setTimeout(() => finish(-1, "SIGKILL", new Error("timeout")), 5000)
      hardTimer.unref?.()
    }, timeoutMs)

    finish = (code, signal, error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        code,
        signal,
        stdout,
        stderr: stderr + (error ? String(error) : ""),
        timedOut,
      })
    }

    child.stdout.on("data", (chunk) => { stdout += chunk.toString() })
    child.stderr.on("data", (chunk) => { stderr += chunk.toString() })
    child.on("error", (error) => finish(-1, null, error))
    child.on("close", (code, signal) => finish(code, signal))
  })
}

function parseEvents(stdout) {
  const events = []
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed.startsWith("{")) continue
    try {
      events.push(JSON.parse(trimmed))
    } catch {
      // partial or non-JSON line
    }
  }
  return events
}

function summarizeEvents(events) {
  let costUsd = 0
  let input = 0
  let output = 0
  let reasoning = 0
  let cacheRead = 0
  let cacheWrite = 0
  let steps = 0
  let toolCalls = 0
  let retries = 0
  let sessionID = null
  let finalText = ""
  const errors = []

  for (const event of events) {
    sessionID ||= event.sessionID || event.part?.sessionID || null
    if (event.type === "step_finish") {
      steps++
      costUsd += event.part?.cost || 0
      const tokens = event.part?.tokens || {}
      input += tokens.input || 0
      output += tokens.output || 0
      reasoning += tokens.reasoning || 0
      cacheRead += tokens.cache?.read || 0
      cacheWrite += tokens.cache?.write || 0
    } else if (event.type === "tool_use") {
      toolCalls++
    } else if (event.type === "retry") {
      retries++
    } else if (event.type === "error") {
      errors.push(event.error?.message || JSON.stringify(event.error))
    } else if (event.type === "text") {
      const text = event.part?.text || ""
      if (text) finalText += (finalText ? "\n" : "") + text
    }
  }

  return {
    costUsd,
    tokens: {
      input,
      output,
      reasoning,
      cacheRead,
      cacheWrite,
      total: input + output + reasoning + cacheWrite + cacheRead,
    },
    steps,
    toolCalls,
    retries,
    errors,
    sessionID,
    finalText,
  }
}

const IGNORED_NAMES = new Set([
  ".git",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  "node_modules",
  "tests_hidden",
  ".DS_Store",
])

function ignoredName(name) {
  return IGNORED_NAMES.has(name) || name.endsWith(".pyc") || name.endsWith(".pyo")
}

function hashDir(dir) {
  if (!fs.existsSync(dir)) return null
  const hash = crypto.createHash("sha256")
  const walk = (current) => {
    for (const name of fs.readdirSync(current).sort()) {
      if (ignoredName(name)) continue
      const full = path.join(current, name)
      const stat = fs.statSync(full)
      if (stat.isDirectory()) walk(full)
      else {
        hash.update(path.relative(dir, full))
        hash.update(fs.readFileSync(full))
      }
    }
  }
  walk(dir)
  return hash.digest("hex")
}

function parseNumstat(text) {
  let files = 0
  let insertions = 0
  let deletions = 0
  for (const line of text.trim().split("\n")) {
    if (!line.trim()) continue
    const [added, removed] = line.split("\t")
    files++
    insertions += added === "-" ? 0 : Number(added) || 0
    deletions += removed === "-" ? 0 : Number(removed) || 0
  }
  return { files, insertions, deletions }
}

async function git(repoDir, args) {
  return runProcess("git", args, { cwd: repoDir, timeoutMs: 30000 })
}

async function prepareRepo(baseDir, task) {
  fs.mkdirSync(baseDir, { recursive: true })
  const repoDir = path.join(baseDir, "repo")
  fs.cpSync(task.repoDir, repoDir, { recursive: true })
  fs.copyFileSync(path.join(task.dir, "task.md"), path.join(repoDir, "TASK.md"))

  // Keep test runs and Python/Node caches out of the agent's diff.
  const ignorePath = path.join(repoDir, ".gitignore")
  const existing = fs.existsSync(ignorePath) ? fs.readFileSync(ignorePath, "utf8") : ""
  const rules = [
    "__pycache__/",
    "*.py[cod]",
    ".pytest_cache/",
    ".mypy_cache/",
    ".ruff_cache/",
    "node_modules/",
    "tests_hidden/",
    "data/",
    ".DS_Store",
  ]
  fs.writeFileSync(
    ignorePath,
    existing + (existing && !existing.endsWith("\n") ? "\n" : "") + rules.join("\n") + "\n",
  )

  await git(repoDir, ["init", "-q"])
  await git(repoDir, ["add", "-A"])
  await git(repoDir, [
    "-c", "user.name=bench",
    "-c", "user.email=bench@example.invalid",
    "commit", "-qm", "baseline",
  ])
  return repoDir
}

function copyRepoSnapshot(src, dest) {
  fs.cpSync(src, dest, {
    recursive: true,
    filter: (source) => !ignoredName(path.basename(source)),
  })
}

function agentCommand({ repoDir, config, opts, agentName, prompt }) {
  const agentArgs = [
    "run", "--standalone", "--auto", "--format", "json",
    "--agent", agentName,
    "-m", opts.model,
    prompt,
  ]

  if (!opts.sandbox) {
    return { command: "opencode", args: agentArgs, cwd: repoDir }
  }

  const home = os.homedir()
  const globalConfig = path.join(home, ".config/opencode")
  const cacheDir = path.join(home, ".cache/opencode")
  const args = [
    "--ro-bind", "/", "/",
    "--dev", "/dev",
    "--proc", "/proc",
    "--unshare-pid",
    "--die-with-parent",
    // A writable /tmp for the agent and OpenCode's own temp files.
    "--bind", "/tmp", "/tmp",
    // Hide our validation artifacts.
    "--tmpfs", "/tmp/opencode",
    // Hide the benchmark source, including bench/tasks/<id>/hidden.
    "--tmpfs", REPO_ROOT,
    // Hide previous OpenCode sessions and the other arm's configuration.
    "--tmpfs", path.join(home, ".local/share/opencode"),
    "--tmpfs", path.join(home, ".local/state/opencode"),
  ]

  if (config === "baseline") {
    args.push("--tmpfs", globalConfig)
  } else {
    args.push("--bind", globalConfig, globalConfig)
  }

  if (fs.existsSync(cacheDir)) args.push("--bind", cacheDir, cacheDir)
  args.push("--chdir", repoDir, "--", "opencode", ...agentArgs)
  return { command: "bwrap", args }
}

async function runOne({ task, config, rep, opts, outDir }) {
  const runDir = path.join(outDir, "runs", task.id, config, `rep-${rep}`)
  fs.mkdirSync(runDir, { recursive: true })
  fs.mkdirSync(WORK_ROOT, { recursive: true })
  // Run outside the repository so the agent cannot walk up into bench/tasks/<id>/hidden.
  const workRoot = fs.mkdtempSync(path.join(WORK_ROOT, `${task.id}-${config}-`))
  const repoDir = await prepareRepo(workRoot, task)
  const testsBefore = hashDir(path.join(repoDir, "tests"))
  const agentName = config === "baseline" ? opts.baselineAgent : opts.treatmentAgent
  const prompt =
    task.prompt ||
    "Read TASK.md and complete it. Run the visible tests. " +
      "Do not modify anything under tests/. Reply with a brief summary of what you changed."
  const timeoutMs = Math.min(task.timeoutSec || Infinity, opts.timeoutSec) * 1000

  // Give each run a clean data/state home, with only the provider credentials.
  const dataHome = path.join(workRoot, "data")
  const stateHome = path.join(workRoot, "state")
  fs.mkdirSync(path.join(dataHome, "opencode"), { recursive: true })
  fs.mkdirSync(path.join(stateHome, "opencode"), { recursive: true })
  const authSrc = path.join(os.homedir(), ".local/share/opencode/auth.json")
  if (fs.existsSync(authSrc)) {
    fs.copyFileSync(authSrc, path.join(dataHome, "opencode", "auth.json"))
  }

  const command = agentCommand({ repoDir, config, opts, agentName, prompt })
  const started = Date.now()
  const agent = await runProcess(command.command, command.args, {
    cwd: command.cwd || repoDir,
    env: benchEnv(config, { dataHome, stateHome }),
    timeoutMs,
  })
  const durationMs = Date.now() - started
  const events = parseEvents(agent.stdout)
  const summary = summarizeEvents(events)

  fs.writeFileSync(path.join(runDir, "events.jsonl"), agent.stdout)
  fs.writeFileSync(path.join(runDir, "stderr.txt"), agent.stderr)

  await git(repoDir, ["add", "-A"])
  const diffStat = await git(repoDir, ["diff", "--cached", "--stat"])
  const diffNumstat = await git(repoDir, ["diff", "--cached", "--numstat"])
  const diffPatch = await git(repoDir, ["diff", "--cached"])
  fs.writeFileSync(path.join(runDir, "diff.patch"), diffPatch.stdout)

  const testsAfter = hashDir(path.join(repoDir, "tests"))
  const testsModified = testsBefore !== testsAfter

  const visible = await runProcess("bash", ["-lc", task.visible], {
    cwd: repoDir,
    timeoutMs: 120000,
  })
  fs.cpSync(task.hiddenDir, path.join(repoDir, "tests_hidden"), { recursive: true })
  const hidden = await runProcess("bash", ["-lc", task.hidden], {
    cwd: repoDir,
    timeoutMs: 120000,
  })
  fs.writeFileSync(path.join(runDir, "visible.txt"), visible.stdout + visible.stderr)
  fs.writeFileSync(path.join(runDir, "hidden.txt"), hidden.stdout + hidden.stderr)

  const visiblePass = visible.code === 0 && !visible.timedOut
  const hiddenPass = hidden.code === 0 && !hidden.timedOut
  const success =
    agent.code === 0 &&
    !agent.timedOut &&
    summary.errors.length === 0 &&
    visiblePass &&
    hiddenPass &&
    !testsModified

  const result = {
    task: task.id,
    config,
    rep,
    agent: agentName,
    model: opts.model,
    startedAt: new Date(started).toISOString(),
    durationMs,
    agentExitCode: agent.code,
    timedOut: agent.timedOut,
    costUsd: summary.costUsd,
    tokens: summary.tokens,
    steps: summary.steps,
    toolCalls: summary.toolCalls,
    retries: summary.retries,
    errors: summary.errors,
    sessionID: summary.sessionID,
    visiblePass,
    hiddenPass,
    testsModified,
    success,
    diff: parseNumstat(diffNumstat.stdout),
    diffStat: diffStat.stdout.trim(),
    finalText: summary.finalText.slice(0, 4000),
  }

  fs.writeFileSync(path.join(runDir, "result.json"), JSON.stringify(result, null, 2) + "\n")
  try {
    copyRepoSnapshot(repoDir, path.join(runDir, "repo"))
  } finally {
    fs.rmSync(workRoot, { recursive: true, force: true })
  }
  return result
}

function failedResult({ task, config, rep, opts, error }) {
  return {
    task: task.id,
    config,
    rep,
    agent: config === "baseline" ? opts.baselineAgent : opts.treatmentAgent,
    model: opts.model,
    startedAt: new Date().toISOString(),
    durationMs: 0,
    agentExitCode: -1,
    timedOut: false,
    costUsd: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    steps: 0,
    toolCalls: 0,
    retries: 0,
    errors: [String(error?.stack || error)],
    sessionID: null,
    visiblePass: false,
    hiddenPass: false,
    testsModified: false,
    success: false,
    diff: { files: 0, insertions: 0, deletions: 0 },
    diffStat: "",
    finalText: "",
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    process.stdout.write(usage())
    return
  }

  const tasks = loadTasks(opts.tasks)
  const configs = opts.configs.split(",").map((value) => value.trim()).filter(Boolean)
  for (const config of configs) {
    if (config !== "baseline" && config !== "treatment") {
      throw new Error(`Unknown config: ${config}`)
    }
  }

  const outDir = opts.out
    ? path.resolve(opts.out)
    : path.join(RESULTS_DIR, timestamp())

  const plan = []
  for (const task of tasks) {
    for (const config of configs) {
      for (let rep = 1; rep <= opts.reps; rep++) plan.push({ task, config, rep })
    }
  }

  console.log(
    `Benchmark: ${tasks.length} tasks x ${configs.length} configs x ${opts.reps} reps = ${plan.length} runs`,
  )
  console.log(`Model: ${opts.model}`)
  console.log(`Timeout: ${opts.timeoutSec}s per run`)
  console.log(`Output: ${outDir}`)

  if (opts.dryRun) {
    for (const item of plan) {
      console.log(`- ${item.task.id} ${item.config} rep ${item.rep}`)
    }
    if (!opts.sandbox && !opts.noSandbox) {
      console.log("WARNING: sandbox unavailable; real runs will be rejected. Install bwrap or pass --no-sandbox (invalid results).")
    }
    return
  }

  if (!opts.sandbox && !opts.noSandbox) {
    throw new Error(
      "bwrap is unavailable, so the agent could escape the run directory and edit the source fixtures.\n" +
        "Install bubblewrap (bwrap) or rerun with --no-sandbox to accept invalid results for debugging.",
    )
  }
  if (opts.noSandbox) {
    console.warn("WARNING: running without a sandbox. These results are not valid for publication.")
  }

  ensureBaselineConfig()
  fs.mkdirSync(outDir, { recursive: true })

  const results = []
  for (const item of plan) {
    const label = `${item.task.id} ${item.config} rep ${item.rep}`
    process.stdout.write(`[${results.length + 1}/${plan.length}] ${label} ... `)
    let result
    try {
      result = await runOne({ ...item, opts, outDir })
    } catch (error) {
      result = failedResult({ ...item, opts, error })
      const runDir = path.join(outDir, "runs", item.task.id, item.config, `rep-${item.rep}`)
      fs.mkdirSync(runDir, { recursive: true })
      fs.writeFileSync(path.join(runDir, "result.json"), JSON.stringify(result, null, 2) + "\n")
    }
    results.push(result)
    const status = result.success ? "PASS" : "FAIL"
    const seconds = Math.round(result.durationMs / 1000)
    console.log(`${status} (${seconds}s, $${result.costUsd.toFixed(4)})`)
  }

  writeSummary(outDir, results, opts)
  console.log(`\nSummary: ${path.join(outDir, "summary.md")}`)
}

main().catch((error) => {
  console.error(error.stack || error)
  process.exit(1)
})
