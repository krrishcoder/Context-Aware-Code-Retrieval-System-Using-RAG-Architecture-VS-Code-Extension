import hashlib
import os
from typing import Dict, Iterable, List, Tuple

from .chunker import parse_python_chunks


IGNORED_DIRS = {
    ".cache_rag",
    ".git",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".tox",
    ".venv",
    "__pycache__",
    "build",
    "dist",
    "node_modules",
    "site-packages",
    "venv",
}


def scan_python_files(folder_path: str) -> List[str]:
    py_files = []
    for root, dirs, files in os.walk(folder_path):
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS and not d.startswith(".")]
        for file_name in files:
            if file_name.endswith(".py"):
                py_files.append(os.path.join(root, file_name))
    return sorted(py_files)


def fingerprint_files(file_paths: Iterable[str]) -> Tuple[str, Dict[str, Dict[str, float]]]:
    metadata = {}
    for file_path in file_paths:
        try:
            stat = os.stat(file_path)
        except OSError:
            continue
        metadata[file_path] = {"mtime": stat.st_mtime, "size": stat.st_size}

    source = "\n".join(
        f"{path}:{info['mtime']}:{info['size']}" for path, info in sorted(metadata.items())
    )
    return hashlib.sha1(source.encode("utf-8")).hexdigest(), metadata


def collect_file_chunks(folder_path: str, file_path: str) -> List[dict]:
    try:
        with open(file_path, "r", encoding="utf-8") as handle:
            source_code = handle.read()
    except UnicodeDecodeError:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as handle:
            source_code = handle.read()
    except OSError:
        return []

    try:
        display_file = os.path.relpath(file_path, folder_path)
    except ValueError:
        display_file = file_path

    return parse_python_chunks(source_code, file_path, display_file)


def collect_chunks(folder_path: str, file_paths: Iterable[str]) -> List[dict]:
    all_chunks = []
    for file_path in file_paths:
        all_chunks.extend(collect_file_chunks(folder_path, file_path))
    return all_chunks


def changed_files(current_files: Iterable[str], current_metadata: dict, cached_metadata: dict):
    current_set = set(current_files)
    cached_set = set(cached_metadata)

    added_or_modified = [
        file_path
        for file_path in sorted(current_set)
        if cached_metadata.get(file_path) != current_metadata.get(file_path)
    ]
    removed = sorted(cached_set - current_set)
    unchanged = sorted(current_set - set(added_or_modified))
    return added_or_modified, removed, unchanged
