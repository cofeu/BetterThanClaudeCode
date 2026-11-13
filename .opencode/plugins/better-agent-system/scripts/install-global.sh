#!/usr/bin/env bash
# Install the Better Agent System for every project.
#
# - Copies the plugin to ~/.config/opencode/plugins/better-agent-system
# - Merges agents, default_agent, tool_output and compaction into
#   ~/.config/opencode/opencode.json (other keys such as mcp are preserved)
# - Links the docs venv so the document skills work everywhere
#
# Re-run after editing agents or skills: npm run install:global
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"        # plugin directory
ROOT="$(cd "$SRC/../../.." && pwd)"            # project root
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
DEST_PLUGIN="$CONFIG_DIR/plugins/better-agent-system"
GLOBAL_CONFIG="$CONFIG_DIR/opencode.json"

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

# 4. Merge agents and runtime limits into the global config.
node - "$ROOT/opencode.jsonc" "$GLOBAL_CONFIG" <<'NODE'
const fs = require("fs")
const [projectPath, globalPath] = process.argv.slice(2)
const project = JSON.parse(fs.readFileSync(projectPath, "utf8"))
const global = fs.existsSync(globalPath)
  ? JSON.parse(fs.readFileSync(globalPath, "utf8"))
  : {}

global.agents = { ...(global.agents ?? {}), ...(project.agents ?? {}) }
if (project.default_agent) global.default_agent = project.default_agent
if (project.tool_output) global.tool_output = project.tool_output
if (project.compaction) global.compaction = project.compaction
if (project.permissions) global.permissions = project.permissions

fs.writeFileSync(globalPath, JSON.stringify(global, null, 2) + "\n")
const n = Object.keys(project.agents ?? {}).length
console.log(`Merged ${n} agents into ${globalPath}`)
NODE

echo "Plugin: $DEST_PLUGIN"
echo "Skills: 39 | Agents: 25 | Commands: $COMMAND_COUNT"
echo "Reload with: opencode reload"
