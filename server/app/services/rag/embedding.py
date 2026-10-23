import asyncio
import threading
from functools import lru_cache
from importlib import import_module

import numpy as np

from app.config import settings
from app.logging_config import get_logger

logger = get_logger(__name__)


@lru_cache(maxsize=1)
def _load_model():
    # fastembed runs the model on ONNX Runtime: no PyTorch, ~2 s to load and ~160 MB.
    # Its all-MiniLM-L6-v2 gives the same vectors sentence-transformers did, so stored
    # memory stays valid. Imported lazily so the server starts without loading it.
    logger.info(f"Loading embedding model: {settings.embedding_model_name}")
    TextEmbedding = import_module("fastembed").TextEmbedding
    return TextEmbedding(settings.embedding_model_name)


_loading = threading.Lock()


def _model():
    # lru_cache doesn't lock: the first requests, each in its own worker thread,
    # would all load the model at once (memory a small server doesn't have).
    with _loading:
        return _load_model()


def embed_texts_sync(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []

    model = _model()
    embeddings = np.asarray(list(model.embed(texts)), dtype=np.float32)
    # Retrieval scores with a dot product, so every vector must be unit length.
    embeddings /= np.linalg.norm(embeddings, axis=1, keepdims=True).clip(min=1e-12)
    return [[float(value) for value in row] for row in embeddings]


async def embed_texts(texts: list[str]) -> list[list[float]]:
    return await asyncio.to_thread(embed_texts_sync, texts)


async def embed_query(text: str) -> list[float]:
    embeddings = await embed_texts([text])
    return embeddings[0] if embeddings else []
