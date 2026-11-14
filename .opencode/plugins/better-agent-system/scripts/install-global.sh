#!/usr/bin/env bash
# Install the Better Agent System for every project.
#
# - Copies the plugin to ~/.config/opencode/plugins/better-agent-system
# - Merges into the global opencode.json or opencode.jsonc (JSONC safe)
# - Writes a timestamped backup before changing the config
# - Preserves unrelated keys, agents and permission rules
# - Updates system-managed agents with the same id; --keep-agents skips them
# - Keeps an existing default_agent unless --force is passed
#
# Usage: npm run install:global [-- --keep-agents] [-- --force]
set -euo pipefail

KEEP_AGENTS=0
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --keep-agents) KEEP_AGENTS=1 ;;
    --force) FORCE=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

SRC="$(cd "$(dirname "$0")/.." && pwd)"        # plugin directory
ROOT="$(cd "$SRC/../../.." && pwd)"            # project root
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
DEST_PLUGIN="$CONFIG_DIR/plugins/better-agent-system"

# Prefer an existing global config in either extension; never create a second one.
if [ -f "$CONFIG_DIR/opencode.json" ]; then
  GLOBAL_CONFIG="$CONFIG_DIR/opencode.json"
elif [ -f "$CONFIG_DIR/opencode.jsonc" ]; then
  GLOBAL_CONFIG="$CONFIG_DIR/opencode.jsonc"
else
  GLOBAL_CONFIG="$CONFIG_DIR/opencode.json"
fi

mkdir -p "$CONFIG_DIR/plugins" "$DEST_PLUGIN"

# 1. Copy the plugin without the venv or build artifacts.
tar -C "$SRC" \
  --exclude=.venv-docs \
  --exclude=node_modules \
  --exclude=.git \
  -cf - . | tar -C "$DEST_PLUGIN" -xf -

# 2. Share the document venv (cheap symlink; create it once in the project).
if [ -d "$SRC/.venv-docs" ] && [ ! -e "$DEST_PLUGIN/.venv-docs" ]; then
  ln -s "$SRC/.venv-docs" "$DEST_PLUGIN/.venv-docs"
fi

# 3. Copy global slash commands.
COMMAND_COUNT=0
if [ -d "$ROOT/.opencode/commands" ]; then
  mkdir -p "$CONFIG_DIR/commands"
  for file in "$ROOT/.opencode/commands/"*.md; do
    [ -e "$file" ] || continue
    cp "$file" "$CONFIG_DIR/commands/"
    COMMAND_COUNT=$((COMMAND_COUNT + 1))
  done
fi

# 4. Merge agents, permissions and runtime limits into the global config.
node - "$ROOT/opencode.jsonc" "$GLOBAL_CONFIG" "$KEEP_AGENTS" "$FORCE" <<'NODE'
const fs = require("fs")
const [projectPath, globalPath, keepFlag, forceFlag] = process.argv.slice(2)
const keepAgents = keepFlag === "1"
const force = forceFlag === "1"

/** Parse JSONC: comments and trailing commas are allowed. */
function parseJsonc(text, label) {
  text = text.replace(/^\uFEFF/, "")
  let out = ""
  let i = 0
  let inString = false
  let escaped = false
  while (i < text.length) {
    const c = text[i]
    const n = text[i + 1]
    if (inString) {
      out += c
      if (escaped) escaped = false
      else if (c === "\\") escaped = true
      else if (c === '"') inString = false
      i++
      continue
    }
    if (c === '"') {
      inString = true
      out += c
      i++
      continue
    }
    if (c === "/" && n === "/") {
      i += 2
      while (i < text.length && text[i] !== "\n") i++
      continue
    }
    if (c === "/" && n === "*") {
      i += 2
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++
      i += 2
      continue
    }
    if (c === ",") {
      let j = i + 1
      for (;;) {
        while (j < text.length && /\s/.test(text[j])) j++
        if (text[j] === "/" && text[j + 1] === "/") {
          while (j < text.length && text[j] !== "\n") j++
          continue
        }
        if (text[j] === "/" && text[j + 1] === "*") {
          j += 2
          while (j < text.length && !(text[j] === "*" && text[j + 1] === "/")) j++
          j += 2
          continue
        }
        break
      }
      if (text[j] === "}" || text[j] === "]") {
        i++
        continue
      }
    }
    out += c
    i++
  }
  try {
    return JSON.parse(out)
  } catch (error) {
    throw new Error(`${label}: ${error.message}`)
  }
}

const project = parseJsonc(fs.readFileSync(projectPath, "utf8"), projectPath)
const exists = fs.existsSync(globalPath)
const global = exists ? parseJsonc(fs.readFileSync(globalPath, "utf8"), globalPath) : {}

let backup = null
if (exists) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  backup = `${globalPath}.bak-${stamp}`
  fs.copyFileSync(globalPath, backup)
}

// Agents: add new ids, update managed ids with the same name, keep unrelated ones.
const projectAgents = project.agents ?? {}
global.agents = global.agents ?? {}
const added = []
const updated = []
const kept = []
for (const [id, agent] of Object.entries(projectAgents)) {
  if (global.agents[id]) {
    if (keepAgents) {
      kept.push(id)
      continue
    }
    updated.push(id)
  } else {
    added.push(id)
  }
  global.agents[id] = agent
}

// Permissions: append only rules that do not already exist. Existing user rules win.
const projectPermissions = Array.isArray(project.permissions) ? project.permissions : []
let permissionsAdded = 0
if (projectPermissions.length) {
  if (global.permissions === undefined) global.permissions = []
  if (Array.isArray(global.permissions)) {
    const key = (rule) => `${rule.action}\u0000${rule.resource}`
    const existing = new Set(global.permissions.map(key))
    for (const rule of projectPermissions) {
      if (existing.has(key(rule))) continue
      global.permissions.push(rule)
      existing.add(key(rule))
      permissionsAdded++
    }
  } else {
    console.log("! global permissions is not an array; left untouched")
  }
}

// Runtime limits: merge objects so unrelated keys survive.
if (project.tool_output) {
  global.tool_output = { ...(global.tool_output ?? {}), ...project.tool_output }
}
if (project.compaction) {
  const globalKeep = global.compaction?.keep
  global.compaction = { ...(global.compaction ?? {}), ...project.compaction }
  if (project.compaction.keep) {
    global.compaction.keep = { ...(globalKeep ?? {}), ...project.compaction.keep }
  }
}

// default_agent: set when missing, keep the user's choice otherwise.
let defaultNote = "not set"
if (project.default_agent) {
  if (!global.default_agent) {
    global.default_agent = project.default_agent
    defaultNote = `set to ${project.default_agent}`
  } else if (force) {
    global.default_agent = project.default_agent
    defaultNote = `forced to ${project.default_agent}`
  } else {
    defaultNote = `kept ${global.default_agent} (use --force to replace)`
  }
}

const tempPath = `${globalPath}.tmp-${process.pid}`
fs.writeFileSync(tempPath, JSON.stringify(global, null, 2) + "\n")
fs.renameSync(tempPath, globalPath)

console.log(`Config: ${globalPath}`)
console.log(`Backup: ${backup ?? "none (new file)"}`)
console.log(`Agents: +${added.length} added, ${updated.length} updated${kept.length ? `, ${kept.length} kept` : ""}`)
if (updated.length) console.log(`  updated: ${updated.join(", ")}`)
if (kept.length) console.log(`  kept: ${kept.join(", ")}`)
console.log(`Permissions: +${permissionsAdded} added, existing rules preserved`)
console.log(`default_agent: ${defaultNote}`)
NODE

echo "Plugin: $DEST_PLUGIN"
echo "Skills: 40 | Agents: 25 | Commands: $COMMAND_COUNT"
echo "Reload with: opencode reload"
