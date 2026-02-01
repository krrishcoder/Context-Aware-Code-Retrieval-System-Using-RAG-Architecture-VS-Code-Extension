import ast
from typing import List, Dict


# Parse code with AST

def parse_code(source_code: str):
    return ast.parse(source_code)


#  Extract functions and classes

def get_chunks(source_code: str) -> List[Dict]:
    tree = parse_code(source_code)
    lines = source_code.splitlines()
    chunks = []

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            start_line = node.lineno
            end_line = find_end_line(node)
            code_lines = lines[start_line - 1:end_line]

            # Include docstring if present
            docstring = ast.get_docstring(node)
            docstring_lines = docstring.splitlines() if docstring else []

            chunk = {
                'type': 'class' if isinstance(node, ast.ClassDef) else 'function',
                'name': node.name,
                'start_line': start_line,
                'end_line': end_line,
                'docstring': docstring_lines,  # optional
                'code': code_lines             # required
            }
            chunks.append(chunk)
    return chunks


# Find the end line of a node

def find_end_line(node) -> int:
    if hasattr(node, 'body') and node.body:
        last_node = node.body[-1]
        if hasattr(last_node, 'end_lineno') and last_node.end_lineno:
            return last_node.end_lineno
        else:
            return find_end_line(last_node)
    return node.lineno


# Display chunks

def display_chunks(chunks: List[Dict]):
    for chunk in chunks:
        print(f"\n--- {chunk['type'].title()}: {chunk['name']} ---")
        print(f"Lines {chunk['start_line']} to {chunk['end_line']}")
        if chunk['docstring']:
            print("Docstring:")
            for line in chunk['docstring']:
                print(f"  {line}")
        print("Code:")
        for line in chunk['code']:
            print(line)
        print("-" * 40)






#  Generate embedding text from chunk

def get_embedding_text(chunk: Dict) -> str:
    """
    Combine function/class name and code (plus docstring if any)
    into a single string for embedding.
    """
    code_text = "\n".join(chunk['code'])
    embedding_text = f"{chunk['type'].title()} name: {chunk['name']}\nCode:\n{code_text}"
    if chunk['docstring']:
        docstring_text = "\n".join(chunk['docstring'])
        embedding_text += f"\nDocstring:\n{docstring_text}"
    return embedding_text


#  Load embedding model

# For demonstration, using SentenceTransformers lightweight model
from sentence_transformers import SentenceTransformer
import numpy as np
import faiss
import time
import os
import json

# load model once per process
model = SentenceTransformer('all-MiniLM-L6-v2')  # free & fast


def _save_cache(index, chunks, cache_index_path, cache_chunks_path):
    # ensure parent exists
    os.makedirs(os.path.dirname(cache_index_path), exist_ok=True)
    faiss.write_index(index, cache_index_path)
    # write minimal chunk info
    with open(cache_chunks_path, 'w', encoding='utf8') as fh:
        json.dump(chunks, fh)


def _load_cache(cache_index_path, cache_chunks_path):
    if not (os.path.exists(cache_index_path) and os.path.exists(cache_chunks_path)):
        return None, None
    index = faiss.read_index(cache_index_path)
    with open(cache_chunks_path, 'r', encoding='utf8') as fh:
        chunks = json.load(fh)
    return index, chunks


def final_lines_founded(query: str, chunks, cache_dir: str = None, fingerprint: str = None, force_rebuild: bool = False):
    """Return a short text with top matching chunk start lines and timings.

    Returns (txt, timings)
    """
    timings = {}

    # If caching requested, try to load cached index/chunks
    index = None
    cached_chunks = None
    if cache_dir and fingerprint and not force_rebuild:
        cache_index_path = os.path.join(cache_dir, f"{fingerprint}_index.faiss")
        cache_chunks_path = os.path.join(cache_dir, f"{fingerprint}_chunks.json")
        index, cached_chunks = _load_cache(cache_index_path, cache_chunks_path)

    # If no chunks were provided and cache doesn't exist, nothing to search
    if (not chunks) and (index is None):
        return "", {"num_chunks": 0}

    # If cache not available, build embeddings and index and save cache if requested
    if index is None:
        t_emb_start = time.time()
        embedding_texts = [get_embedding_text(c) for c in chunks]
        embeddings = model.encode(embedding_texts, convert_to_numpy=True)
        embeddings = np.asarray(embeddings)
        if embeddings.ndim == 1:
            embeddings = embeddings[np.newaxis, :]
        t_emb_end = time.time()
        timings['embedding_time'] = t_emb_end - t_emb_start

        t_idx_start = time.time()
        d = embeddings.shape[1]
        index = faiss.IndexFlatL2(d)
        index.add(embeddings)
        t_idx_end = time.time()
        timings['index_build_time'] = t_idx_end - t_idx_start

        # store mapping
        cached_chunks = chunks

        if cache_dir and fingerprint:
            cache_index_path = os.path.join(cache_dir, f"{fingerprint}_index.faiss")
            cache_chunks_path = os.path.join(cache_dir, f"{fingerprint}_chunks.json")
            try:
                _save_cache(index, cached_chunks, cache_index_path, cache_chunks_path)
            except Exception:
                # ignore cache write failures
                pass

    id_to_chunk = {i: chunk for i, chunk in enumerate(cached_chunks)}

    # Encode query and perform search
    t_qstart = time.time()
    query_embedding = model.encode([query], convert_to_numpy=True)
    query_embedding = np.asarray(query_embedding)
    if query_embedding.ndim == 1:
        query_embedding = query_embedding[np.newaxis, :]
    t_qend = time.time()
    timings['query_encode_time'] = t_qend - t_qstart

    k = min(5, len(cached_chunks))
    t_search_start = time.time()
    distances, indices = index.search(query_embedding, k)
    t_search_end = time.time()
    timings['search_time'] = t_search_end - t_search_start

    timings['num_chunks'] = len(cached_chunks)
    timings['total_rag_time'] = sum([timings.get('embedding_time', 0), timings.get('index_build_time', 0), timings.get('query_encode_time', 0), timings.get('search_time', 0)])

    txt = ""
    for i, idx in enumerate(indices[0]):
        if idx < 0:
            continue
        chunk = id_to_chunk.get(int(idx))
        if not chunk:
            continue

        display_file = chunk.get('display_file') or chunk.get('filename')
        if display_file:
            txt += f"{display_file}:{chunk['start_line']}: ({chunk['name']}) \n"
        else:
            txt += f"{chunk['start_line']}: ({chunk['name']}) \n"

    return txt, timings



