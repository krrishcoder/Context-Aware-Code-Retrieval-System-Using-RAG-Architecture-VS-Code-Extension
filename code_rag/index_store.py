import json
import os
from typing import Optional, Tuple

import numpy as np


class IndexStore:
    def __init__(self, workspace_path: str):
        self.cache_dir = os.path.join(workspace_path, ".cache_rag")
        self.meta_path = os.path.join(self.cache_dir, "meta.json")
        self.chunks_path = os.path.join(self.cache_dir, "chunks.json")
        self.embeddings_path = os.path.join(self.cache_dir, "embeddings.npy")

    def load(self, fingerprint: str) -> Optional[Tuple[list, np.ndarray]]:
        state = self.load_state()
        if not state:
            return None

        meta, chunks, embeddings = state
        if meta.get("fingerprint") != fingerprint:
            return None

        return chunks, embeddings

    def load_state(self) -> Optional[Tuple[dict, list, np.ndarray]]:
        if not self._has_cache():
            return None

        try:
            with open(self.meta_path, "r", encoding="utf-8") as handle:
                meta = json.load(handle)
            with open(self.chunks_path, "r", encoding="utf-8") as handle:
                chunks = json.load(handle)
            embeddings = np.load(self.embeddings_path)
        except (OSError, ValueError, json.JSONDecodeError):
            return None

        if len(chunks) != len(embeddings):
            return None

        return meta, chunks, embeddings

    def save(self, fingerprint: str, file_metadata: dict, chunks: list, embeddings: np.ndarray) -> None:
        self.save_state({"fingerprint": fingerprint, "files": file_metadata}, chunks, embeddings)

    def save_state(self, meta: dict, chunks: list, embeddings: np.ndarray) -> None:
        os.makedirs(self.cache_dir, exist_ok=True)
        with open(self.chunks_path, "w", encoding="utf-8") as handle:
            json.dump(chunks, handle)
        np.save(self.embeddings_path, embeddings)
        with open(self.meta_path, "w", encoding="utf-8") as handle:
            json.dump(meta, handle)

    def _has_cache(self) -> bool:
        return all(
            os.path.exists(path)
            for path in (self.meta_path, self.chunks_path, self.embeddings_path)
        )
