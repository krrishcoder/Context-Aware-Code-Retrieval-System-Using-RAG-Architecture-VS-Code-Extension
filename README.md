# KrrishCoder – Context-Aware Code Retrieval [live](https://marketplace.visualstudio.com/items?itemName=krrishcoder07.krrishcoder07&ssr=false#review-details)
![demo video](https://github.com/krrishcoder/Context-Aware-Code-Retrieval-System-Using-RAG-Architecture-VS-Code-Extension/blob/main/clideo_editor_7509c440842e4cc9aaf1742489ca8e8c.gif)


This VS Code extension helps developers find relevant parts of their codebase using retrieval-augmented search.

What we have implemented
- Natural-language search (for example: "Where is my login code?")
- Scans the whole opened workspace for Python files, not just the active file
- Retrieves the top 5 relevant functions/classes and shows file path plus line range
- Click a search result to open the file at the matching line in the editor
- Caches workspace embeddings in `.cache_rag`, compares Python files with fast `mtime`/size metadata, and re-embeds only changed files
- Uses `fastembed` and `numpy`; PyTorch and `sentence-transformers` are not required
- Language support: Python
- Published to the Visual Studio Marketplace as `krrishcoder07.krrishcoder07` (version 0.0.4)

Usage
1. Install the extension from the Visual Studio Marketplace.
2. Open the Command Palette (Ctrl+Shift+P) and run **RAG Search: Context-Aware Code Search** or **RAG Chat: Ask code questions**.
3. Enter your query and select a result to navigate to the code.

On activation, the extension checks Python dependencies and installs the packages from `requirements.txt` with `pip --user` if they are missing. You can force a fresh code index with **RAG: Rebuild Index**.

Release Notes
### 0.0.4
- Published initial version with the implemented features listed above.

- Initial release with Python support
