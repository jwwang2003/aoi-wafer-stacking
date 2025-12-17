#!/usr/bin/env python3
"""
Clean up the Tauri app's AppData directory (SQLite DB and related files).

The script looks for the Tauri identifier in src-tauri/tauri.conf.json (and
platform overrides) so it targets the same folder the app uses at runtime.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = REPO_ROOT / "src-tauri"

# Files we expect inside the AppData directory
DB_FILES = ("data.db", "data.db-shm", "data.db-wal")
CONFIG_FILES = ("preferences.json", "data_sources.json")


def load_identifier(system: str, override: str | None) -> str:
    """
    Resolve the Tauri identifier, honoring platform-specific overrides.
    """
    if override:
        return override

    base_identifier = "com.aoi.wafer.stacking"
    base_config = CONFIG_DIR / "tauri.conf.json"
    if base_config.exists():
        with base_config.open(encoding="utf-8") as f:
            base_identifier = json.load(f).get("identifier", base_identifier)

    platform_config = {
        "Windows": CONFIG_DIR / "tauri.windows.conf.json",
        "Darwin": CONFIG_DIR / "tauri.macos.conf.json",
    }.get(system)

    if platform_config and platform_config.exists():
        with platform_config.open(encoding="utf-8") as f:
            base_identifier = json.load(f).get("identifier", base_identifier)

    return base_identifier


def appdata_dir(system: str, identifier: str) -> Path:
    """
    Mirror Tauri's AppData folder resolution for the current platform.
    """
    if system == "Windows":
        base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    elif system == "Darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))

    return base / identifier


def gather_targets(appdata_path: Path, nuke_all: bool) -> list[Path]:
    """
    Build the list of paths to delete.
    """
    if nuke_all:
        return [appdata_path]

    return [appdata_path / name for name in (*DB_FILES, *CONFIG_FILES)]


def delete_path(path: Path) -> None:
    if not path.exists():
        return

    if path.is_dir():
        shutil.rmtree(path)
    else:
        path.unlink()


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Remove the Tauri AppData directory or its DB files."
    )
    parser.add_argument(
        "--identifier",
        help="Override the Tauri identifier (default: read from tauri conf)",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Delete the entire AppData directory instead of just DB/config files.",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Do not prompt for confirmation.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be removed without deleting anything.",
    )

    args = parser.parse_args(argv)
    system = platform.system()
    identifier = load_identifier(system, args.identifier)
    target_dir = appdata_dir(system, identifier)
    targets = [p for p in gather_targets(target_dir, args.all) if p.exists()]

    if not targets:
        print(f"Nothing to delete. Looked in: {target_dir}")
        return 0

    print(f"Resolved AppData path: {target_dir}")
    print("Will remove:")
    for path in targets:
        print(f"  - {path}")

    if args.dry_run:
        print("Dry run only; no files were deleted.")
        return 0

    if not args.yes:
        answer = input("Proceed? [y/N] ").strip().lower()
        if answer not in {"y", "yes"}:
            print("Aborted.")
            return 1

    for path in targets:
        delete_path(path)

    print("Cleanup complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
