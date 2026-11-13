from fastapi import FastAPI, HTTPException, Body
from pydantic import BaseModel, Field
from dotenv import load_dotenv
import logging
import os

# Load environment variables from .env file
load_dotenv()

from embeddings import get_embedding, load_model # .embeddings assumes embeddings.py is in the same directory
import vector_store

# Configure logging (consistent with embeddings.py)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI(
    title="JobSense Embedding Service",
    description="Provides text embedding generation using sentence-transformers.",
    version="1.0.0"
)

class TextPayload(BaseModel):
    text: str = Field(..., min_length=1, description="The text to be embedded.")

class EmbeddingResponse(BaseModel):
    text: str
    embedding: list[float]
    model_name: str

class JobIn(BaseModel):
    job_id: str = Field(..., min_length=1, description="Mongo _id, used as the Chroma id.")
    title: str
    company: str
    location: str = ""
    url: str
    tags: list[str] = []
    posted_date: int = Field(0, description="Unix epoch seconds.")
    description: str = ""

class BulkJobsIn(BaseModel):
    jobs: list[JobIn]

@app.on_event("startup")
async def startup_event():
    logger.info("Embedding Service starting up...")
    try:
        load_model() # Pre-load the model on startup
        logger.info("Model pre-loading initiated successfully.")
    except Exception as e:
        logger.critical(f"Failed to load model during startup: {e}", exc_info=True)
        # Depending on policy, you might want the app to fail starting.
        # For now, it logs critical and continues; embedding requests will fail if model isn't loaded.

@app.post("/embed", response_model=EmbeddingResponse, status_code=200)
async def embed_text_endpoint(payload: TextPayload = Body(...)):
    """
    Accepts a text string and returns its embedding vector and the model name used.
    """
    logger.info(f"Received embedding request for text (first 50 chars): '{payload.text[:50]}...'")

    if not payload.text.strip(): # Check for empty or whitespace-only strings
        logger.error("Received empty or whitespace-only text in payload.")
        raise HTTPException(status_code=400, detail="Text cannot be empty or whitespace only.")

    try:
        embedding_vector = get_embedding(payload.text)
        if not embedding_vector:
            # This could happen if the model failed to load or an issue occurred in get_embedding
            logger.error(f"Failed to generate embedding for text: {payload.text[:100]}")
            raise HTTPException(status_code=500, detail="Embedding generation failed. Check service logs.")

        current_model_name = os.getenv("EMBEDDING_MODEL_NAME", 'all-MiniLM-L6-v2')
        return EmbeddingResponse(text=payload.text, embedding=embedding_vector, model_name=current_model_name)
    except HTTPException:
        raise # Re-raise HTTPException to let FastAPI handle it
    except Exception as e:
        logger.error(f"Unexpected error in /embed endpoint for text '{payload.text[:50]}...': {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/index")
def index_job(job: JobIn):
    """Embed one job and upsert it into ChromaDB."""
    try:
        vector_store.upsert_jobs([job.model_dump()])
    except Exception as e:
        logger.error(f"Indexing job {job.job_id} failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Indexing failed. Check service logs.")
    return {"indexed": 1, "count": vector_store.get_collection().count()}

@app.post("/index/bulk")
def index_jobs_bulk(payload: BulkJobsIn):
    """Embed many jobs in one batch and upsert them into ChromaDB."""
    try:
        n = vector_store.upsert_jobs([j.model_dump() for j in payload.jobs])
    except Exception as e:
        logger.error(f"Bulk indexing of {len(payload.jobs)} jobs failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Bulk indexing failed. Check service logs.")
    return {"indexed": n, "count": vector_store.get_collection().count()}

@app.get("/index/stats")
def index_stats():
    """How many jobs are in ChromaDB."""
    return {"count": vector_store.get_collection().count()}

@app.get("/health", status_code=200)
async def health_check():
    """
    Health check endpoint.
    """
    # Optionally, add a check to see if the model is loaded
    try:
        load_model() # This will throw an error if model loading fails
        return {"status": "healthy", "model_status": "loaded", "model_name": os.getenv("EMBEDDING_MODEL_NAME", 'all-MiniLM-L6-v2')}
    except Exception as e:
        logger.error(f"Health check: Model not loaded or error during check: {e}")
        return {"status": "degraded", "model_status": "error_loading_model", "detail": str(e)}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8001))
    logger.info(f"Starting Uvicorn server on host 0.0.0.0 port {port}")
    # For development: uvicorn app:app --reload --port 8001 --host 0.0.0.0
    # For production, use a Gunicorn/Uvicorn worker setup.
    uvicorn.run(app, host="0.0.0.0", port=port)