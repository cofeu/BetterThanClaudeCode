#!/usr/bin/env node
/**
 * Token budget guard for the Better Agent System.
 *
 * Fixed cost per request = aptive agent instructions + every skill description.
 * Skill CONTENT is on-demand, so it only needs a per-skill ceiling.
 *
 * Usage: node scripts/token-budget.mjs [--json]
 * Exit code 1 when a hard budget is exceeded.
 */

import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, "../../../..")
const configPath = resolve(root, "opencode.jsonc")
const pluginPath = resolve(here, "../src/index.ts")

const BUDGET = {
  agentInstructions: 180, // tokens per agent system prompt
  skillDescription: 18, // tokens per skill description
  skillDescriptionsTotal: 500, // all descriptions, always in context
  fixedPerRequest: 700, // largest agent + all descriptions
  skillContent: 1400, // tokens per skill body, on-demand
}

// Fields accepted by opencode.ai/config.json -> Config.AgentEncoded (v2.3).
const AGENT_KEYS = new Set([
  "model",
  "request",
  "system",
  "description",
  "mode",
  "hidden",
  "color",
  "steps",
  "disabled",
  "permissions",
])

/** Approximate tokens: never lower than a word-based estimate. */
export function estimateTokens(text) {
  const chars = text.length
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  return Math.max(Math.ceil(chars / 4), Math.ceil(words * 1.3))
}

export function loadSkills(file = pluginPath) {
  const source = readFileSync(file, "utf8")
  const re =
    /id: "([^"]+)",\s*\n\s*name: "([^"]+)",\s*\n\s*description: "([^"]+)",\s*\n\s*content: `([\s\S]*?)`,\s*\n\s*autoinvoke: (true|false),/g
  const skills = []
  let match
  while ((match = re.exec(source))) {
    skills.push({
      id: match[1],
      name: match[2],
      description: match[3],
      content: match[4],
      autoinvoke: match[5] === "true",
    })
  }
  return skills
}

export function loadAgents(file = configPath) {
  const raw = readFileSync(file, "utf8")
  let config
  try {
    config = JSON.parse(raw)
  } catch (err) {
    throw new Error(`opencode.jsonc is not valid JSON: ${err.message}`)
  }
  return { config, agents: config.agents ?? {} }
}

export function audit() {
  const skills = loadSkills()
  const { config, agents } = loadAgents()
  const errors = []
  const warnings = []

  const agentRows = Object.entries(agents).map(([id, agent]) => {
    // v2.3 uses "system"; "instructions" is silently ignored at runtime.
    const instructions = agent.system ?? ""
    const tokens = estimateTokens(instructions)
    for (const key of Object.keys(agent)) {
      if (!AGENT_KEYS.has(key)) {
        errors.push(`agent ${id}: unsupported key "${key}"`)
      }
    }
    if (!agent.description) errors.push(`agent ${id}: missing description`)
    if (!instructions) errors.push(`agent ${id}: missing system prompt`)
    if (agent.model) errors.push(`agent ${id}: hardcoded model (must inherit session)`)
    if (tokens > BUDGET.agentInstructions) {
      errors.push(
        `agent ${id}: ~${tokens} tok > ${BUDGET.agentInstructions} budget`,
      )
    }
    return { id, tokens, chars: instructions.length }
  })

  const skillRows = skills.map((skill) => {
    const descTokens = estimateTokens(skill.description)
    const contentTokens = estimateTokens(skill.content)
    if (!skill.autoinvoke) warnings.push(`skill ${skill.id}: autoinvoke disabled`)
    if (descTokens > BUDGET.skillDescription) {
      errors.push(
        `skill ${skill.id}: description ~${descTokens} tok > ${BUDGET.skillDescription}`,
      )
    }
    if (contentTokens > BUDGET.skillContent) {
      errors.push(
        `skill ${skill.id}: content ~${contentTokens} tok > ${BUDGET.skillContent}`,
      )
    }
    return { id: skill.id, descTokens, contentTokens }
  })

  const ids = new Set()
  for (const skill of skills) {
    if (ids.has(skill.id)) errors.push(`duplicate skill id: ${skill.id}`)
    ids.add(skill.id)
  }

  const descriptions = new Map()
  for (const skill of skills) {
    const key = skill.description.toLowerCase()
    if (descriptions.has(key)) {
      errors.push(
        `skill ${skill.id}: duplicate description with ${descriptions.get(key)}`,
      )
    }
    descriptions.set(key, skill.id)
  }

  const referenced = new Set()
  for (const [id, agent] of Object.entries(agents)) {
    const instructions = agent.system ?? ""
    for (const match of instructions.matchAll(
      /skills? ([a-z0-9-]+(?:, [a-z0-9-]+)*)/g,
    )) {
      for (const skill of match[1].split(", ")) {
        referenced.add(skill)
        if (!ids.has(skill)) {
          errors.push(`agent ${id}: references missing skill "${skill}"`)
        }
      }
    }
  }
  // Unreferenced auto-invoke skills are fine: their description is already in
  // context and the model triggers them by keyword. Reporting them keeps the
  // intent visible without failing the budget.
  const notes = []
  for (const skill of skills) {
    if (!referenced.has(skill.id)) {
      notes.push(`skill ${skill.id}: auto-invoke only (no agent reference)`)
    }
  }

  const descTotal = skillRows.reduce((n, s) => n + s.descTokens, 0)
  const contentTotal = skillRows.reduce((n, s) => n + s.contentTokens, 0)
  const largestAgent = agentRows.reduce(
    (max, a) => (a.tokens > max.tokens ? a : max),
    { id: "-", tokens: 0 },
  )
  const fixedPerRequest = largestAgent.tokens + descTotal

  if (descTotal > BUDGET.skillDescriptionsTotal) {
    errors.push(
      `skill descriptions total ~${descTotal} tok > ${BUDGET.skillDescriptionsTotal}`,
    )
  }
  if (fixedPerRequest > BUDGET.fixedPerRequest) {
    errors.push(
      `fixed per-request ~${fixedPerRequest} tok > ${BUDGET.fixedPerRequest}`,
    )
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    notes,
    budget: BUDGET,
    totals: {
      agents: agentRows.length,
      skills: skillRows.length,
      descTotal,
      contentTotal,
      largestAgent: largestAgent.id,
      largestAgentTokens: largestAgent.tokens,
      fixedPerRequest,
      avgAgentTokens: Math.round(
        agentRows.reduce((n, a) => n + a.tokens, 0) / Math.max(agentRows.length, 1),
      ),
    },
    agents: agentRows.sort((a, b) => b.tokens - a.tokens),
    skills: skillRows.sort((a, b) => b.contentTokens - a.contentTokens),
  }
}

function main() {
  const report = audit()

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2))
    process.exit(report.ok ? 0 : 1)
  }

  const t = report.totals
  console.log("Better Agent System - token budget")
  console.log("=".repeat(52))
  console.log(`agents                : ${t.agents}`)
  console.log(`skills                : ${t.skills}`)
  console.log(`avg agent             : ~${t.avgAgentTokens} tok`)
  console.log(`largest agent         : ${t.largestAgent} (~${t.largestAgentTokens} tok)`)
  console.log(`skill descriptions    : ~${t.descTotal} tok (always in context)`)
  console.log(`fixed per request     : ~${t.fixedPerRequest} tok`)
  console.log(`on-demand skill bodies: ~${t.contentTotal} tok (loaded only when used)`)
  console.log("")
  console.log("Top agent costs:")
  for (const a of report.agents.slice(0, 5)) {
    console.log(`  ${a.id.padEnd(22)} ~${String(a.tokens).padStart(4)} tok`)
  }
  console.log("Top skill bodies (on-demand):")
  for (const s of report.skills.slice(0, 5)) {
    console.log(`  ${s.id.padEnd(22)} ~${String(s.contentTokens).padStart(4)} tok`)
  }

  if (report.warnings.length) {
    console.log("")
    console.log("Warnings:")
    for (const w of report.warnings) console.log(`  - ${w}`)
  }

  if (report.notes.length) {
    console.log("")
    console.log(`Notes (${report.notes.length} auto-invoke skills, no agent ref):`)
  }

  console.log("")
  if (report.ok) {
    console.log("PASS - all budgets respected")
  } else {
    console.log("FAIL - budget violations:")
    for (const e of report.errors) console.log(`  - ${e}`)
  }
  process.exit(report.ok ? 0 : 1)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
