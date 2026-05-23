import time
from typing import Dict, Tuple

import numpy as np

from .chunker import chunk_to_embedding_text
from .embeddings import Embedder
from .index_store import IndexStore
from .scanner import changed_files, collect_file_chunks, fingerprint_files, scan_python_files


def search_workspace(
    query: str,
    folder_path: str,
    top_k: int = 5,
    force_rebuild: bool = False,
) -> Tuple[str, Dict[str, float]]:
    start = time.time()
    files = scan_python_files(folder_path)
    fingerprint, file_metadata = fingerprint_files(files)
    store = IndexStore(folder_path)
    timings: Dict[str, float] = {"num_files": len(files)}

    cache_start = time.time()
    cached_state = None if force_rebuild else store.load_state()
    timings["cache_load_time"] = time.time() - cache_start

    if cached_state:
        meta, cached_chunks, cached_embeddings = cached_state
        chunks, embeddings, cache_dirty = _build_incremental_index(
            folder_path,
            files,
            file_metadata,
            meta.get("files", {}),
            cached_chunks,
            cached_embeddings,
            timings,
        )
    else:
        chunks, embeddings, cache_dirty = _build_fresh_index(folder_path, files, timings)

    if cache_dirty:
        store.save(fingerprint, file_metadata, chunks, embeddings)

    timings["num_chunks"] = len(chunks)
    if not chunks:
        timings["total"] = time.time() - start
        return "", timings

    embedder = Embedder()
    query_start = time.time()
    query_embedding = embedder.encode([query])
    timings["query_encode_time"] = time.time() - query_start

    search_start = time.time()
    scores = embeddings @ query_embedding[0]
    count = min(top_k, len(chunks))
    top_indices = np.argsort(scores)[::-1][:count]
    timings["search_time"] = time.time() - search_start
    timings["total"] = time.time() - start

    return _format_results(chunks, scores, top_indices), timings


def _build_fresh_index(folder_path: str, files: list, timings: Dict[str, float]):
    chunks = []
    chunk_start = time.time()
    for file_path in files:
        chunks.extend(collect_file_chunks(folder_path, file_path))
    timings["chunk_time"] = time.time() - chunk_start
    timings["changed_files"] = len(files)
    timings["removed_files"] = 0
    return chunks, _embed_chunks(chunks, timings), True


def _build_incremental_index(
    folder_path: str,
    files: list,
    file_metadata: dict,
    cached_metadata: dict,
    cached_chunks: list,
    cached_embeddings: np.ndarray,
    timings: Dict[str, float],
):
    changed, removed, unchanged = changed_files(files, file_metadata, cached_metadata)
    timings["changed_files"] = len(changed)
    timings["removed_files"] = len(removed)
    cache_dirty = bool(changed or removed)

    cached_by_file = _cached_chunks_by_file(cached_chunks, cached_embeddings)
    chunk_start = time.time()
    changed_chunks = []
    for file_path in changed:
        changed_chunks.extend(collect_file_chunks(folder_path, file_path))
    timings["chunk_time"] = time.time() - chunk_start

    changed_embeddings = _embed_chunks(changed_chunks, timings, _embedding_width(cached_embeddings))
    new_by_file = _cached_chunks_by_file(changed_chunks, changed_embeddings)

    chunks = []
    embedding_parts = []
    for file_path in files:
        if file_path in unchanged and file_path in cached_by_file:
            file_chunks, file_embeddings = cached_by_file[file_path]
        else:
            file_chunks, file_embeddings = new_by_file.get(
                file_path,
                ([], _empty_embeddings(_embedding_width(cached_embeddings))),
            )

        chunks.extend(file_chunks)
        if len(file_embeddings):
            embedding_parts.append(file_embeddings)

    if not embedding_parts:
        return chunks, _empty_embeddings(_embedding_width(cached_embeddings)), cache_dirty
    return chunks, np.vstack(embedding_parts).astype("float32"), cache_dirty


def _cached_chunks_by_file(chunks: list, embeddings: np.ndarray):
    grouped = {}
    for idx, chunk in enumerate(chunks):
        grouped.setdefault(chunk["filename"], [[], []])
        grouped[chunk["filename"]][0].append(chunk)
        grouped[chunk["filename"]][1].append(embeddings[idx])

    return {
        file_path: (file_chunks, np.vstack(file_embeddings).astype("float32"))
        for file_path, (file_chunks, file_embeddings) in grouped.items()
        if file_embeddings
    }


def _embed_chunks(chunks: list, timings: Dict[str, float], empty_width: int = 0) -> np.ndarray:
    if not chunks:
        return _empty_embeddings(empty_width)

    embedder = Embedder()
    embedding_start = time.time()
    embeddings = embedder.encode(chunk_to_embedding_text(chunk) for chunk in chunks)
    timings["embedding_time"] = timings.get("embedding_time", 0) + (time.time() - embedding_start)
    return embeddings


def _embedding_width(embeddings: np.ndarray) -> int:
    return embeddings.shape[1] if getattr(embeddings, "ndim", 0) == 2 else 0


def _empty_embeddings(width: int) -> np.ndarray:
    return np.empty((0, width), dtype="float32")


def _format_results(chunks: list, scores: np.ndarray, indices: np.ndarray) -> str:
    lines = []
    for idx in indices:
        chunk = chunks[int(idx)]
        lines.append(
            f"{chunk['display_file']}:{chunk['start_line']}-{chunk['end_line']}: "
            f"({chunk['name']}) score={scores[int(idx)]:.3f}"
        )
    return "\n".join(lines)
