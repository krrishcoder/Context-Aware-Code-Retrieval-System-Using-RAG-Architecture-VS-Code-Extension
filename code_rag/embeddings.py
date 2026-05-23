from typing import Iterable, List

import numpy as np
from fastembed import TextEmbedding


DEFAULT_MODEL = "BAAI/bge-small-en-v1.5"


class Embedder:
    def __init__(self, model_name: str = DEFAULT_MODEL):
        self._model = TextEmbedding(model_name=model_name)

    def encode(self, texts: Iterable[str]) -> np.ndarray:
        vectors: List[np.ndarray] = [np.asarray(vec, dtype="float32") for vec in self._model.embed(list(texts))]
        if not vectors:
            return np.empty((0, 0), dtype="float32")

        embeddings = np.vstack(vectors)
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        norms[norms == 0] = 1
        return embeddings / norms

