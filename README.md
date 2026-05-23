# KrrishCoder - Context-Aware Code Retrieval

[View on VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=krrishcoder07.krrishcoder07&ssr=false#review-details)


KrrishCoder is a VS Code extension that helps developers find relevant code using natural-language, retrieval-augmented search.

## Features

- Ask natural-language questions like "Where is my login code?"
- Search across the whole opened Python workspace, not only one file
- Retrieve the top 5 relevant functions/classes
- Show file path and line range for each result
- Click a result to open the file directly at the matching line
- Use a chat-style UI for asking codebase questions
- Cache embeddings in `.cache_rag` for faster repeated searches
- Re-chunk and re-embed only changed Python files using fast `mtime`/size comparison
- Use `fastembed` and `numpy`; PyTorch and `sentence-transformers` are not required

## Usage

1. Install the extension.
2. Open a Python project folder in VS Code.
3. Open the Command Palette with `Ctrl+Shift+P` or `Cmd+Shift+P`.
4. Run **RAG Chat: Ask code questions**.
5. Type your question and click a result to navigate to the code.

You can also use:

- **RAG Search: Context-Aware Code Search** for quick-pick search results
- **RAG: Rebuild Index** to force a fresh workspace index

On activation, the extension checks Python dependencies and installs the packages from `requirements.txt` with `pip --user` if they are missing.

## Current Language Support

- Python

## Future Plans

- Support for Java, C++, and JavaScript
- Improved ranking of code snippets
- Integration with AI assistants
- More detailed code explanations inside chat

## Release Notes

### 2.0.0

- Added workspace-wide Python code retrieval
- Added chat-style VS Code webview UI
- Added clickable file and line-range results
- Replaced `sentence-transformers` with lightweight `fastembed`
- Removed PyTorch requirement
- Added automatic Python dependency installation
- Added incremental cache refresh for changed files only
- Modularized the Python retrieval code

### 1.0.0

- Initial release with Python support
