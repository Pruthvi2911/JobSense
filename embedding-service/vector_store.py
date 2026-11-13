"""
ChromaDB access for JobSense.

One persistent Chroma client, one collection called "jobs".
We always pass our own embeddings (from embeddings.get_embedding), so Chroma
never loads its own embedding model.
"""
import logging
import os

import chromadb

from embeddings import get_embedding

logger = logging.getLogger(__name__)

COLLECTION_NAME = "jobs"

_client = None
_collection = None


def get_collection():
    """Return the "jobs" collection, creating the client and collection on first use."""
    global _client, _collection
    if _collection is None:
        path = os.getenv("CHROMA_PATH") or "./chroma_data"
        _client = chromadb.PersistentClient(path=path)
        _collection = _client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},  # distance = 1 - cosine similarity
            embedding_function=None,             # we supply embeddings ourselves
        )
        logger.info(f"Chroma collection '{COLLECTION_NAME}' ready at {path} ({_collection.count()} items)")
    return _collection


def embed(text: str) -> list[float]:
    """Embed text with the service's existing sentence-transformers model."""
    vector = get_embedding(text)
    if not vector:
        raise ValueError("Embedding failed")
    return vector
