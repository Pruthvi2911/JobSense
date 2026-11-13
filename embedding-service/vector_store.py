"""
ChromaDB access for JobSense.

One persistent Chroma client, one collection called "jobs".
We always pass our own embeddings (from embeddings.get_embedding), so Chroma
never loads its own embedding model.
"""
import logging
import os
import re

import chromadb

from embeddings import get_embedding, load_model

logger = logging.getLogger(__name__)

COLLECTION_NAME = "jobs"

# all-MiniLM-L6-v2 only reads the first ~256 tokens (roughly 1,000-1,500 characters
# of English). Anything after that is silently ignored, so we cut the text ourselves
# and put the most useful parts (title, skills) first.
MAX_DOC_CHARS = 1500

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


def embed_many(texts: list[str]) -> list[list[float]]:
    """Embed many texts in one batched call (same model, much faster than one by one)."""
    vectors = load_model().encode(texts, batch_size=32, show_progress_bar=False)
    return [v.tolist() for v in vectors]


def tag_key(tag: str) -> str:
    """'Full Stack' -> 'tag_full_stack'. Used both when indexing and when filtering."""
    slug = re.sub(r"[^a-z0-9]+", "_", tag.strip().lower()).strip("_")
    return f"tag_{slug}" if slug else ""


def build_document(job: dict) -> str:
    """The text we embed for one job: title, then skills, then description."""
    tags = ", ".join(job.get("tags") or [])
    text = f"{job['title']}. Skills: {tags}. {job.get('description') or ''}"
    return text[:MAX_DOC_CHARS]


def build_metadata(job: dict) -> dict:
    """Flat metadata Chroma can filter on. Chroma can't search inside a string,
    so each tag becomes its own boolean key (tag_python: True)."""
    tags = [t.strip() for t in (job.get("tags") or []) if t and t.strip()]
    meta = {
        "title": job["title"],
        "company": job["company"],
        "url": job["url"],
        "location": (job.get("location") or "remote").strip().lower(),
        "posted_date": int(job.get("posted_date") or 0),
        "tags_display": ", ".join(tags),
    }
    for t in tags:
        key = tag_key(t)
        if key:
            meta[key] = True
    return meta


def upsert_jobs(jobs: list[dict]) -> int:
    """Embed and upsert jobs. The Mongo _id is the Chroma id, so re-indexing
    the same job overwrites it instead of creating a duplicate."""
    if not jobs:
        return 0
    docs = [build_document(j) for j in jobs]
    get_collection().upsert(
        ids=[j["job_id"] for j in jobs],
        embeddings=embed_many(docs),
        documents=docs,
        metadatas=[build_metadata(j) for j in jobs],
    )
    return len(jobs)
