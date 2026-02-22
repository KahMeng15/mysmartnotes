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


def find_relevant_snippets(query: str, text: str, top_k: int = 3, chunk_size: int = 500) -> List[str]:
    """
    Find the most relevant text chunks for a query using semantic similarity.
    
    Args:
        query: The search query
        text: The full text to search in
        top_k: Number of top snippets to return
        chunk_size: Approximate size of each chunk in characters
    
    Returns:
        List of top-k most relevant text chunks
    """
    model = get_embeddings_model()
    if model is None or not text:
        return []
    
    try:
        # Split text into chunks
        chunks = []
        words = text.split()
        current_chunk = []
        current_length = 0
        
        for word in words:
            current_chunk.append(word)
            current_length += len(word) + 1
            
            if current_length >= chunk_size:
                chunks.append(" ".join(current_chunk))
                current_chunk = []
                current_length = 0
        
        if current_chunk:
            chunks.append(" ".join(current_chunk))
        
        if not chunks:
            return []
        
        # Encode query and chunks
        query_embedding = model.encode(query, convert_to_tensor=False)
        chunk_embeddings = model.encode(chunks, convert_to_tensor=False)
        
        # Calculate similarities
        similarities = []
        for i, chunk_emb in enumerate(chunk_embeddings):
            sim = float(np.dot(query_embedding, chunk_emb) / (
                np.linalg.norm(query_embedding) * np.linalg.norm(chunk_emb) + 1e-9
            ))
            similarities.append((i, sim, chunks[i]))
        
        # Sort and return top-k
        similarities.sort(key=lambda x: x[1], reverse=True)
        return [s[2] for s in similarities[:top_k]]
    
    except Exception as e:
        logger.error(f"Error in find_relevant_snippets: {e}")
        return []


def combine_snippets(snippets: List[str], max_chars: int = 2000) -> str:
    """
    Combine multiple snippets into a single context string with character limit.
    
    Args:
        snippets: List of text snippets
        max_chars: Maximum total character length
    
    Returns:
        Combined snippets as a single string
    """
    if not snippets:
        return ""
    
    combined = ""
    for snippet in snippets:
        if len(combined) + len(snippet) + 2 <= max_chars:
            if combined:
                combined += "\n\n"
            combined += snippet
        else:
            break
    
    return combined
