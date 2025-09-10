import ast
from typing import List, Dict

# -----------------------------
# Step 1: Parse code with AST
# -----------------------------
def parse_code(source_code: str):
    return ast.parse(source_code)

# -----------------------------
# Step 2: Extract functions and classes
# -----------------------------
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

# -----------------------------
# Step 3: Find the end line of a node
# -----------------------------
def find_end_line(node) -> int:
    if hasattr(node, 'body') and node.body:
        last_node = node.body[-1]
        if hasattr(last_node, 'end_lineno') and last_node.end_lineno:
            return last_node.end_lineno
        else:
            return find_end_line(last_node)
    return node.lineno

# -----------------------------
# Step 4: Display chunks
# -----------------------------
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





# -----------------------------
# Step 6: Generate embedding text from chunk
# -----------------------------
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

# -----------------------------
# Step 7: Load embedding model
# -----------------------------
# For demonstration, using SentenceTransformers lightweight model
from sentence_transformers import SentenceTransformer
import numpy as np
import faiss

model = SentenceTransformer('all-MiniLM-L6-v2')  # free & fast

# -----------------------------
# Step 8: Generate embeddings
# -----------------------------

def final_lines_founded(query:str,chunks)->str:

    embedding_texts = [get_embedding_text(c) for c in chunks]
    embeddings = model.encode(embedding_texts, convert_to_numpy=True)

    # -----------------------------
    # Step 9: Create FAISS index
    # -----------------------------
    d = embeddings.shape[1]  # embedding dimension
    index = faiss.IndexFlatL2(d)  # simple L2 distance index
    index.add(embeddings)

    # -----------------------------
    # Step 10: Store mapping from FAISS id → chunk
    # -----------------------------
    id_to_chunk = {i: chunk for i, chunk in enumerate(chunks)}



    query_embedding = model.encode([query], convert_to_numpy=True)
    k = 5  # number of nearest neighbors to return
    distances, indices = index.search(query_embedding, k)

    print("\nTop matching chunks:")
    txt = ""
    for i, idx in enumerate(indices[0]):
        chunk = id_to_chunk[idx]
        txt += f"{chunk['start_line']}: ({chunk['name']}) \n"

    return txt



