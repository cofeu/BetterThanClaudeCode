#!/usr/bin/env node
// Analyze benchmark results and write summary.md + summary.json.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export function analyze(results) {
  const configs = [...new Set(results.map((result) => result.config))]
  const tasks = [...new Set(results.map((result) => result.task))].sort()

  const valid = (result) =>
    result.agentExitCode === 0 &&
    !result.timedOut &&
    (!result.errors || result.errors.length === 0)

  const overall = {}
  for (const config of configs) {
    const runs = results.filter((result) => result.config === config)
    const good = runs.filter(valid)
    const successes = good.filter((result) => result.success).length
    const [low, high] = wilson(successes, good.length)
    overall[config] = {
      runs: runs.length,
      valid: good.length,
      successes,
      successRate: good.length ? successes / good.length : null,
      ci95: [low, high],
      medianDurationMs: median(good.map((result) => result.durationMs)),
      totalCostUsd: good.reduce((sum, result) => sum + (result.costUsd || 0), 0),
      medianCostUsd: median(good.map((result) => result.costUsd)),
      medianTokens: median(good.map((result) => result.tokens?.total || 0)),
      medianSteps: median(good.map((result) => result.steps || 0)),
      medianToolCalls: median(good.map((result) => result.toolCalls || 0)),
      medianDiffLines: median(
        good.map((result) => (result.diff?.insertions || 0) + (result.diff?.deletions || 0)),
      ),
    }
  }

  const perTask = {}
  for (const task of tasks) {
    perTask[task] = {}
    for (const config of configs) {
      const runs = results.filter(
        (result) => result.task === task && result.config === config,
      )
      const good = runs.filter(valid)
      perTask[task][config] = {
        runs: runs.length,
        valid: good.length,
        successes: good.filter((result) => result.success).length,
      }
    }
  }

  const pairs = []
  const keys = [...new Set(results.map((result) => `${result.task}\u0000${result.rep}`))]
  for (const key of keys) {
    const [task, rep] = key.split("\u0000")
    const baseline = results.find(
      (result) => result.task === task && result.rep === Number(rep) && result.config === "baseline",
    )
    const treatment = results.find(
      (result) => result.task === task && result.rep === Number(rep) && result.config === "treatment",
    )
    if (!baseline || !treatment) continue
    if (!valid(baseline) || !valid(treatment)) continue
    pairs.push({ task, rep: Number(rep), baseline: baseline.success, treatment: treatment.success })
  }

  const baselineOnly = pairs.filter((pair) => pair.baseline && !pair.treatment).length
  const treatmentOnly = pairs.filter((pair) => !pair.baseline && pair.treatment).length
  const ties = pairs.filter((pair) => pair.baseline === pair.treatment).length

  const models = [...new Set(results.map((result) => result.model).filter(Boolean))].sort()
  const perTaskModels = {}
  for (const task of tasks) {
    perTaskModels[task] = [
      ...new Set(
        results
          .filter((result) => result.task === task)
          .map((result) => result.model)
          .filter(Boolean),
      ),
    ].sort()
  }

  return {
    configs,
    tasks,
    models,
    perTaskModels,
    overall,
    perTask,
    paired: {
      pairs: pairs.length,
      baselineOnly,
      treatmentOnly,
      ties,
      mcnemarP: mcnemarExact(baselineOnly, treatmentOnly),
    },
  }
}

function median(values) {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (!clean.length) return null
  const middle = Math.floor(clean.length / 2)
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2
}

function wilson(successes, total, z = 1.96) {
  if (!total) return [0, 0]
  const p = successes / total
  const denominator = 1 + (z * z) / total
  const center = p + (z * z) / (2 * total)
  const margin = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))
  return [
    Math.max(0, (center - margin) / denominator),
    Math.min(1, (center + margin) / denominator),
  ]
}

function binomial(n, k) {
  if (k < 0 || k > n) return 0
  let result = 1
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i
  return result
}

function mcnemarExact(baselineOnly, treatmentOnly) {
  const n = baselineOnly + treatmentOnly
  if (n === 0) return 1
  const smaller = Math.min(baselineOnly, treatmentOnly)
  let tail = 0
  for (let i = 0; i <= smaller; i++) tail += binomial(n, i) / 2 ** n
  return Math.min(1, 2 * tail)
}

function formatPercent(value) {
  return value === null || value === undefined ? "—" : `${(value * 100).toFixed(1)}%`
}

function formatNumber(value) {
  return value === null || value === undefined ? "—" : Math.round(value).toLocaleString("en-US")
}

function formatUsd(value) {
  return value === null || value === undefined ? "—" : `$${value.toFixed(4)}`
}

function formatSeconds(value) {
  return value === null || value === undefined ? "—" : `${(value / 1000).toFixed(1)}s`
}

function label(config, results) {
  const agent = results.find((result) => result.config === config)?.agent
  return agent ? `${config} (${agent})` : config
}

export function renderSummary(results, opts = {}) {
  const analysis = analyze(results)
  const { configs, overall, perTask, paired, models, perTaskModels } = analysis
  const lines = []

  lines.push("# Benchmark summary")
  lines.push("")
  if (models.length === 1) {
    lines.push(`- Model: \`${models[0]}\``)
  } else if (models.length > 1) {
    lines.push(`- Models: ${models.map((model) => `\`${model}\``).join(", ")}`)
  } else {
    lines.push("- Model: unknown")
  }
  lines.push(`- Runs: ${results.length}`)
  lines.push(`- Generated: ${new Date().toISOString()}`)
  lines.push("")
  lines.push(
    "> This compares OpenCode's default `build` agent with this system's agent on the same model for each task. " +
      "It is **not** a Claude Code comparison. Small runs are pilots, not proof.",
  )
  lines.push("")
  if (models.length > 1) {
    lines.push("## Models per task")
    lines.push("")
    lines.push("| Task | Model(s) |")
    lines.push("|---|---|")
    for (const task of analysis.tasks) {
      lines.push(`| ${task} | ${perTaskModels[task].map((model) => `\`${model}\``).join(", ")} |`)
    }
    lines.push("")
  }
  lines.push("## Overall")
  lines.push("")
  lines.push(
    "| Config | Valid runs | Success | 95% CI | Median time | Total cost | Median cost | Median tokens | Median steps | Median diff lines |",
  )
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
  for (const config of configs) {
    const row = overall[config]
    lines.push(
      `| ${label(config, results)} | ${row.valid}/${row.runs} | ${row.successes}/${row.valid} (${formatPercent(row.successRate)}) | ` +
        `${formatPercent(row.ci95[0])}–${formatPercent(row.ci95[1])} | ${formatSeconds(row.medianDurationMs)} | ` +
        `${formatUsd(row.totalCostUsd)} | ${formatUsd(row.medianCostUsd)} | ${formatNumber(row.medianTokens)} | ` +
        `${formatNumber(row.medianSteps)} | ${formatNumber(row.medianDiffLines)} |`,
    )
  }
  lines.push("")
  lines.push("## Per task")
  lines.push("")
  lines.push(`| Task | ${configs.map((config) => label(config, results)).join(" | ")} |`)
  lines.push(`|---|${configs.map(() => "---:").join("|")}|`)
  for (const task of analysis.tasks) {
    const cells = configs.map((config) => {
      const row = perTask[task][config]
      return `${row.successes}/${row.valid}`
    })
    lines.push(`| ${task} | ${cells.join(" | ")} |`)
  }
  lines.push("")
  lines.push("## Paired comparison")
  lines.push("")
  lines.push(`- Valid pairs: ${paired.pairs}`)
  lines.push(`- Baseline-only wins: ${paired.baselineOnly}`)
  lines.push(`- Treatment-only wins: ${paired.treatmentOnly}`)
  lines.push(`- Ties: ${paired.ties}`)
  lines.push(`- Exact McNemar p: ${paired.mcnemarP.toFixed(4)}`)
  lines.push("")
  if (paired.mcnemarP < 0.05) {
    lines.push("The paired difference is nominally significant at p < 0.05, but confirm with more repetitions before publishing it.")
  } else {
    lines.push("The paired difference is not statistically significant. Do not claim a win from this run.")
  }
  lines.push("")
  lines.push("## Caveats")
  lines.push("")
  lines.push("- Same-model comparison per task; no Claude Code arm.")
  if (models.length > 1) {
    lines.push(
      "- Different tasks used different free models because provider quotas were exhausted. " +
        "Each task is still a same-model A/B pair, but the aggregate table mixes models; " +
        "do not read it as a single-model result.",
    )
  }
  lines.push("- Hidden tests check behavior, not every edge case.")
  lines.push("- Provider cost and token events can be missing or zero for some models.")
  lines.push("- With few repetitions, one task can flip the result. Increase `--reps` before drawing conclusions.")
  lines.push("")

  return { analysis, markdown: lines.join("\n") }
}

export function writeSummary(outDir, results, opts = {}) {
  const { analysis, markdown } = renderSummary(results, opts)
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, "summary.md"), markdown)
  fs.writeFileSync(
    path.join(outDir, "summary.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        models: analysis.models,
        model: analysis.models.length === 1 ? analysis.models[0] : null,
        analysis,
        results,
      },
      null,
      2,
    ) + "\n",
  )
}

function findResultFiles(dir) {
  const files = []
  const walk = (current) => {
    for (const name of fs.readdirSync(current)) {
      const full = path.join(current, name)
      const stat = fs.statSync(full)
      if (stat.isDirectory()) walk(full)
      else if (name === "result.json") files.push(full)
    }
  }
  walk(dir)
  return files
}

function latestResultsDir() {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "results")
  if (!fs.existsSync(root)) return null
  const entries = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  return entries.length ? path.join(root, entries[entries.length - 1]) : null
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isCli) {
  const dir = process.argv[2] ? path.resolve(process.argv[2]) : latestResultsDir()
  if (!dir || !fs.existsSync(dir)) {
    console.error("Usage: node analyze.mjs <results-dir>")
    process.exit(1)
  }
  const results = findResultFiles(dir).map((file) => JSON.parse(fs.readFileSync(file, "utf8")))
  if (!results.length) {
    console.error(`No result.json files under ${dir}`)
    process.exit(1)
  }
  writeSummary(dir, results)
  console.log(`Wrote ${path.join(dir, "summary.md")}`)
}
