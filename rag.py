from code_rag.chunker import chunk_to_embedding_text, parse_python_chunks
from code_rag.search import search_workspace


def get_chunks(source_code):
    return parse_python_chunks(source_code, "<memory>", "<memory>")


def get_embedding_text(chunk):
    return chunk_to_embedding_text(chunk)


def final_lines_founded(query, chunks=None, cache_dir=None, fingerprint=None, force_rebuild=False):
    if cache_dir:
        workspace = cache_dir.rsplit("/.cache_rag", 1)[0]
        return search_workspace(query, workspace, force_rebuild=force_rebuild)

    return "", {"num_chunks": len(chunks or [])}
