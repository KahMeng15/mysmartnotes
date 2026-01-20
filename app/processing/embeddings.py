"""Embeddings module for semantic search"""
import logging
import json
import os
from typing import List
import numpy as np
from sentence_transformers import SentenceTransformer
from pathlib import Path

logger = logging.getLogger(__name__)

# Global embeddings model
embedding_model = None


def get_embeddings_model():
    """Get or load embeddings model"""
    global embedding_model
    if embedding_model is None:
        try:
            embedding_model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
            logger.info("Embeddings model loaded")
        except Exception as e:
            logger.error(f"Failed to load embeddings model: {e}")
    return embedding_model


def embed_text(text: str) -> List[float]:
    """Convert text to embedding vector"""
    model = get_embeddings_model()
    if model is None:
        return []
    
    try:
        embedding = model.encode(text, convert_to_tensor=False)
        return embedding.tolist()
    except Exception as e:
        logger.error(f"Error embedding text: {e}")
        return []


def embed_texts(texts: List[str]) -> List[List[float]]:
    """Convert multiple texts to embeddings"""
    model = get_embeddings_model()
    if model is None or not texts:
        return []
    
    try:
        embeddings = model.encode(texts, convert_to_tensor=False)
        return embeddings.tolist()
    except Exception as e:
        logger.error(f"Error embedding texts: {e}")
        return []


def similarity(embedding1: List[float], embedding2: List[float]) -> float:
    """Calculate cosine similarity between two embeddings"""
    try:
        a = np.array(embedding1)
        b = np.array(embedding2)
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))
    except Exception as e:
        logger.error(f"Error calculating similarity: {e}")
        return 0.0


def find_similar(query_embedding: List[float], embeddings: List[dict], top_k: int = 5) -> List[dict]:
    """Find most similar embeddings"""
    if not embeddings or not query_embedding:
        return []
    
    similarities = []
    for i, emb_dict in enumerate(embeddings):
        sim = similarity(query_embedding, emb_dict["vector"])
        similarities.append((i, sim, emb_dict))
    
    # Sort by similarity descending
    similarities.sort(key=lambda x: x[1], reverse=True)
    
    return [s[2] for s in similarities[:top_k]]


def save_embeddings(embeddings: List[dict], path: str):
    """Save embeddings to file"""
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            json.dump(embeddings, f)
        logger.info(f"Saved {len(embeddings)} embeddings to {path}")
    except Exception as e:
        logger.error(f"Error saving embeddings: {e}")


def load_embeddings(path: str) -> List[dict]:
    """Load embeddings from file"""
    try:
        if os.path.exists(path):
            with open(path, "r") as f:
                return json.load(f)
        return []
    except Exception as e:
        logger.error(f"Error loading embeddings: {e}")
        return []
