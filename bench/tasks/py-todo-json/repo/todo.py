#!/usr/bin/env python3
import argparse
import json
import os
from pathlib import Path


def load_items(path: Path):
    if not path.exists():
        return []
    return json.loads(path.read_text())


def save_items(path: Path, items):
    path.write_text(json.dumps(items, indent=2) + "\n")


def main(argv=None):
    parser = argparse.ArgumentParser(prog="todo")
    parser.add_argument("--file", default=os.environ.get("TODO_FILE", "todos.json"))
    subparsers = parser.add_subparsers(dest="command", required=True)

    add_parser = subparsers.add_parser("add")
    add_parser.add_argument("text")
    subparsers.add_parser("list")

    args = parser.parse_args(argv)
    path = Path(args.file)
    items = load_items(path)

    if args.command == "add":
        item = {"id": len(items) + 1, "text": args.text, "done": False}
        items.append(item)
        save_items(path, items)
        print(f"added {item['id']}: {item['text']}")
    elif args.command == "list":
        for item in items:
            mark = "x" if item["done"] else " "
            print(f"{item['id']}. [{mark}] {item['text']}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
