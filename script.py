import sys
import os
import json
from rag import get_chunks,final_lines_founded



# CLI parsing: support ->
#  python script.py <query> <folder>
#  python script.py --rebuild <folder>    (rebuild index for folder)
args = sys.argv[1:]
force_rebuild = False
query = ""
folder_path = None
if not args:
    print("")
    sys.exit(0)

if args[0] == '--rebuild':
    force_rebuild = True
    if len(args) < 2:
        print("")
        sys.exit(0)
    folder_path = args[1]
    # optional query after rebuild
    if len(args) >= 3:
        query = args[2]
else:
    if len(args) < 2:
        print("")
        sys.exit(0)
    query = args[0]
    folder_path = args[1]

# folders to ignore when scanning
IGNORED_DIRS = {".venv", "venv", "node_modules", ".git", "__pycache__"}

# RAG
def main():
    import time
    start_all = time.time()

    # Collect all .py files (skip common large folders) and record mtimes
    py_files = []
    file_mtimes = {}
    for root, dirs, files in os.walk(folder_path):
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS]
        for file in files:
            if file.endswith('.py'):
                full = os.path.join(root, file)
                py_files.append(full)
                try:
                    file_mtimes[full] = os.path.getmtime(full)
                except Exception:
                    file_mtimes[full] = 0

    # Compute a fingerprint based on file paths + mtimes (fast)
    import hashlib
    key_source = ''.join(f"{p}:{file_mtimes[p]}" for p in sorted(py_files))
    fingerprint = hashlib.sha1(key_source.encode()).hexdigest()

    # Prepare cache directory and meta path
    cache_dir = os.path.join(folder_path, '.cache_rag')
    os.makedirs(cache_dir, exist_ok=True)
    meta_path = os.path.join(cache_dir, 'meta.json')

    # Check if cached index exists and matches mtimes
    use_cache = False
    if os.path.exists(meta_path):
        try:
            with open(meta_path, 'r', encoding='utf8') as mh:
                meta = json.load(mh)
            if meta.get('fingerprint') == fingerprint:
                use_cache = True
        except Exception:
            use_cache = False

    all_chunks = []
    # If cache valid and not forcing rebuild, avoid parsing files — load cache directly
    if use_cache and not force_rebuild:
        # Call final_lines_founded with empty chunks so rag.py will load the cached index
        result = final_lines_founded(query, [], cache_dir=cache_dir, fingerprint=fingerprint, force_rebuild=False)
        if isinstance(result, tuple):
            top_k_start_lines, rag_timings = result
        else:
            top_k_start_lines = result
            rag_timings = {}
        t1 = time.time()
        t0 = time.time()
        total_time = (time.time() - start_all)
        search_time = (t1 - t0)
        basic = {"total": round(total_time, 3), "search": round(search_time, 3)}
        merged = {**basic, **{k: round(v, 6) for k, v in rag_timings.items()}}
        print(top_k_start_lines)
        import json as _json
        print(f"#timing total={total_time:.2f}s search={search_time:.2f}s", file=sys.stderr)
        print(f"#timing-details: {_json.dumps(merged)}", file=sys.stderr)
        return

    # Otherwise, parse files and build chunks (this is more expensive)
    for f in py_files:
        try:
            with open(f, "r", encoding="utf-8") as ff:
                source_code = ff.read()
        except Exception:
            # skip files we cannot read
            continue

        chunks = get_chunks(source_code)
        for chunk in chunks:
            chunk["filename"] = f
            # prefer a workspace-relative path for display and click-to-open
            try:
                chunk["display_file"] = os.path.relpath(f, folder_path)
            except Exception:
                chunk["display_file"] = f

        all_chunks.extend(chunks)

    # If there are no chunks, return early
    if not all_chunks:
        print("")
        return

    # Compute a simple fingerprint of the corpus to enable caching
    import hashlib
    key_source = ''.join(f"{c['filename']}:{c['start_line']}" for c in all_chunks)
    fingerprint = hashlib.sha1(key_source.encode()).hexdigest()

    # Prepare cache directory
    cache_dir = os.path.join(folder_path, '.cache_rag')
    os.makedirs(cache_dir, exist_ok=True)

    t0 = time.time()
    result = final_lines_founded(query, all_chunks, cache_dir=cache_dir, fingerprint=fingerprint, force_rebuild=force_rebuild)
    # final_lines_founded now returns (text, timings)
    if isinstance(result, tuple):
        top_k_start_lines, rag_timings = result
    else:
        top_k_start_lines = result
        rag_timings = {}
    t1 = time.time()

    # Debug timings
    # total time, indexing/search time
    # Note: printing timings helps diagnose slow steps
    print(top_k_start_lines)
    # print timing to stderr to avoid interfering with output parsing
    total_time = (time.time() - start_all)
    search_time = (t1 - t0)
    basic = {"total": round(total_time, 3), "search": round(search_time, 3)}
    # merge RAG timings
    merged = {**basic, **{k: round(v, 6) for k, v in rag_timings.items()}}
    import json
    print(f"#timing total={total_time:.2f}s search={search_time:.2f}s", file=sys.stderr)
    print(f"#timing-details: {json.dumps(merged)}", file=sys.stderr)

    # Save meta data for later quick loads and notify index built
    try:
        meta_path = os.path.join(cache_dir, 'meta.json')
        meta = {'fingerprint': fingerprint, 'files': {p: file_mtimes[p] for p in py_files}}
        with open(meta_path, 'w', encoding='utf8') as mh:
            json.dump(meta, mh)
        # notify via stderr that index was built for this fingerprint
        print(f"#index-built: {fingerprint}", file=sys.stderr)
    except Exception:
        pass


if __name__ == "__main__":
    main()