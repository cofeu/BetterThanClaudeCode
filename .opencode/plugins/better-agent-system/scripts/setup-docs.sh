#!/usr/bin/env bash
# Isolated Python environment for the document skills (pdf, docx, pptx, xlsx).
# Nothing is installed system-wide; everything lives in .venv-docs.
set -euo pipefail

cd "$(dirname "$0")/.."

PY="${PYTHON:-python3}"
VENV=".venv-docs"

if [ ! -d "$VENV" ]; then
  "$PY" -m venv "$VENV"
fi

"$VENV/bin/pip" install --upgrade --quiet pip
"$VENV/bin/pip" install --quiet \
  pypdf \
  pdfplumber \
  reportlab \
  python-docx \
  python-pptx \
  openpyxl \
  pandas \
  pillow

echo "Installed into $VENV:"
"$VENV/bin/python" - <<'PY'
mods = ["pypdf", "pdfplumber", "reportlab", "docx", "pptx", "openpyxl", "pandas", "PIL"]
import importlib.metadata as md
for m in mods:
    dist = {"docx": "python-docx", "pptx": "python-pptx", "PIL": "pillow"}.get(m, m)
    try:
        print(f"  {m:12} {md.version(dist)}")
    except Exception as exc:
        print(f"  {m:12} MISSING ({exc})")
PY

echo
echo "Use it with: .venv-docs/bin/python your_script.py"
echo "System fallbacks also available: pdftotext, pdftoppm, libreoffice."
