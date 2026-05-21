from functools import lru_cache
from importlib import import_module
from typing import Sequence

from app.logging_config import get_logger

logger = get_logger(__name__)


@lru_cache(maxsize=1)
def _load_model():
    from app.config import settings

    logger.info(f"Loading embedding model: {settings.embedding_model_name}")
    SentenceTransformer = import_module("sentence_transformers").SentenceTransformer
    return SentenceTransformer(settings.embedding_model_name)


def _normalize(vector: Sequence[float]) -> list[float]:
    magnitude = sum(value * value for value in vector) ** 0.5
    if magnitude == 0:
        return [0.0 for _ in vector]
    return [float(value / magnitude) for value in vector]


def embed_texts_sync(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []

    model = _load_model()
    embeddings = model.encode(
        texts,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    return [[float(value) for value in embedding] for embedding in embeddings]


async def embed_texts(texts: list[str]) -> list[list[float]]:
    import asyncio

    return await asyncio.to_thread(embed_texts_sync, texts)


async def embed_query(text: str) -> list[float]:
    embeddings = await embed_texts([text])
    return embeddings[0] if embeddings else []
