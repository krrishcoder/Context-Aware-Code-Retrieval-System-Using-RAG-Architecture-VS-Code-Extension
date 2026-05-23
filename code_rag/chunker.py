import ast
from typing import Dict, List


def parse_python_chunks(source_code: str, file_path: str, display_file: str) -> List[Dict]:
    """Return searchable chunks for a Python file."""
    try:
        tree = ast.parse(source_code)
    except SyntaxError:
        return []

    lines = source_code.splitlines()
    chunks = []

    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            continue

        start_line = node.lineno
        end_line = getattr(node, "end_lineno", None) or _find_end_line(node)
        code_lines = lines[start_line - 1:end_line]
        kind = "class" if isinstance(node, ast.ClassDef) else "function"

        chunks.append(
            {
                "type": kind,
                "name": node.name,
                "start_line": start_line,
                "end_line": end_line,
                "docstring": ast.get_docstring(node) or "",
                "code": "\n".join(code_lines),
                "filename": file_path,
                "display_file": display_file,
            }
        )

    return sorted(chunks, key=lambda c: (c["display_file"], c["start_line"]))


def chunk_to_embedding_text(chunk: Dict) -> str:
    parts = [
        f"File: {chunk['display_file']}",
        f"{chunk['type'].title()}: {chunk['name']}",
        f"Lines: {chunk['start_line']}-{chunk['end_line']}",
    ]
    if chunk.get("docstring"):
        parts.append(f"Docstring:\n{chunk['docstring']}")
    parts.append(f"Code:\n{chunk['code']}")
    return "\n".join(parts)


def _find_end_line(node) -> int:
    if hasattr(node, "body") and node.body:
        return _find_end_line(node.body[-1])
    return getattr(node, "lineno", 1)

