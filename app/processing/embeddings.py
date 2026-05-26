"""Embeddings module for semantic search"""
import logging
import json
import os
from typing import List
import numpy as np
from pathlib import Path

logger = logging.getLogger(__name__)

# Global embeddings model
embedding_model = None


def get_embeddings_model():
    """Get or load embeddings model"""
    global embedding_model
    if embedding_model is None:
        from sentence_transformers import SentenceTransformer
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


def find_relevant_snippets(query: str, text: str, top_k: int = 3, chunk_size: int = 500) -> List[dict]:
    """
    Find the most relevant text chunks for a query using semantic similarity.
    
    Args:
        query: The search query
        text: The full text to search in
        top_k: Number of top snippets to return
        chunk_size: Approximate size of each chunk in characters
    
    Returns:
        List of dicts with 'text', 'position', and 'score' for top-k most relevant chunks
    """
    model = get_embeddings_model()
    if model is None or not text:
        return []
    
    try:
        # Split text into chunks and track positions
        chunks = []
        positions = []
        words = text.split()
        current_chunk = []
        current_length = 0
        char_position = 0
        
        for word in words:
            if not current_chunk:
                # Start position of this chunk
                positions.append(char_position)
            
            current_chunk.append(word)
            current_length += len(word) + 1
            char_position += len(word) + 1
            
            if current_length >= chunk_size:
                chunks.append(" ".join(current_chunk))
                current_chunk = []
                current_length = 0
        
        if current_chunk:
            positions.append(char_position - current_length)
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
            similarities.append({
                'text': chunks[i],
                'position': positions[i] if i < len(positions) else 0,
                'score': round(sim * 100, 1),  # Convert to percentage
                'index': i
            })
        
        # Sort and return top-k
        similarities.sort(key=lambda x: x['score'], reverse=True)
        return similarities[:top_k]
    
    except Exception as e:
        logger.error(f"Error in find_relevant_snippets: {e}")
        return []


def combine_snippets(snippets: List[dict], max_chars: int = 2000) -> str:
    """
    Combine multiple snippet dicts into a single context string with character limit.
    
    Args:
        snippets: List of snippet dicts with 'text' key
        max_chars: Maximum total character length
    
    Returns:
        Combined snippets as a single string
    """
    if not snippets:
        return ""
    
    combined = ""
    for snippet in snippets:
        text = snippet['text'] if isinstance(snippet, dict) else snippet
        if len(combined) + len(text) + 2 <= max_chars:
            if combined:
                combined += "\n\n"
            combined += text
        else:
            break
    
    return combined


def compute_and_store_embeddings(lecture_id: int, text: str, db) -> int:
    """
    Compute embeddings for a lecture and store them in the database.
    
    Args:
        lecture_id: ID of the lecture
        text: Full extracted text
        db: SQLAlchemy Session
        
    Returns:
        Number of embeddings stored
    """
    from app.models.db import LectureEmbedding
    
    if not text or not text.strip():
        logger.warning(f"Lecture {lecture_id} has empty text, skipping embedding")
        return 0
    
    model = get_embeddings_model()
    if model is None:
        logger.error(f"Failed to get embeddings model for lecture {lecture_id}")
        return 0
    
    try:
        # Delete existing embeddings for this lecture
        db.query(LectureEmbedding).filter(
            LectureEmbedding.lecture_id == lecture_id
        ).delete()
        db.commit()
        
        # Split text into chunks
        chunks = []
        positions = []
        words = text.split()
        current_chunk = []
        current_length = 0
        char_position = 0
        chunk_size = 500  # characters
        
        for word in words:
            if not current_chunk:
                positions.append(char_position)
            
            current_chunk.append(word)
            current_length += len(word) + 1
            char_position += len(word) + 1
            
            if current_length >= chunk_size:
                chunks.append(" ".join(current_chunk))
                current_chunk = []
                current_length = 0
        
        if current_chunk:
            positions.append(char_position - current_length)
            chunks.append(" ".join(current_chunk))
        
        if not chunks:
            logger.warning(f"No chunks created for lecture {lecture_id}")
            return 0
        
        # Compute embeddings for all chunks
        embeddings = model.encode(chunks, convert_to_tensor=False)
        
        # Store embeddings in database
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            pos = positions[i] if i < len(positions) else 0
            emb_record = LectureEmbedding(
                lecture_id=lecture_id,
                chunk_text=chunk,
                chunk_index=i,
                embedding=embedding.tolist(),  # Convert numpy array to list
                position=pos
            )
            db.add(emb_record)
        
        db.commit()
        logger.info(f"Stored {len(chunks)} embeddings for lecture {lecture_id}")
        return len(chunks)
        
    except Exception as e:
        logger.error(f"Error computing embeddings for lecture {lecture_id}: {e}")
        db.rollback()
        return 0


def update_lecture_embeddings(lecture_id: int, text: str, db) -> int:
    """
    Update embeddings when lecture content changes.
    Deletes old embeddings and computes new ones.
    
    Args:
        lecture_id: ID of the lecture
        text: Updated extracted text
        db: SQLAlchemy Session
        
    Returns:
        Number of new embeddings stored
    """
    return compute_and_store_embeddings(lecture_id, text, db)


def retrieve_relevant_chunks(
    query: str,
    lecture_ids: List[int],
    db,
    top_k: int = 3
) -> List[dict]:
    """
    Retrieve most relevant pre-computed chunks for a query using vector similarity.
    
    Args:
        query: Search query
        lecture_ids: List of lecture IDs to search within
        db: SQLAlchemy Session
        top_k: Number of top results to return
        
    Returns:
        List of dicts with 'text', 'position', 'score', 'lecture_id'
    """
    from app.models.db import LectureEmbedding
    
    if not lecture_ids or not query:
        return []
    
    model = get_embeddings_model()
    if model is None:
        logger.error("Failed to get embeddings model")
        return []
    
    try:
        # Get all embeddings for the given lectures
        embeddings_records = db.query(LectureEmbedding).filter(
            LectureEmbedding.lecture_id.in_(lecture_ids)
        ).all()
        
        if not embeddings_records:
            logger.warning(f"No embeddings found for lectures {lecture_ids}")
            return []
        
        # Compute query embedding
        query_embedding = model.encode(query, convert_to_tensor=False)
        
        # Calculate similarities
        similarities = []
        for record in embeddings_records:
            chunk_embedding = np.array(record.embedding)
            sim = float(np.dot(query_embedding, chunk_embedding) / (
                np.linalg.norm(query_embedding) * np.linalg.norm(chunk_embedding) + 1e-9
            ))
            similarities.append({
                'text': record.chunk_text,
                'position': record.position,
                'score': round(sim * 100, 1),
                'lecture_id': record.lecture_id,
                'chunk_index': record.chunk_index
            })
        
        # Sort by similarity and return top-k
        similarities.sort(key=lambda x: x['score'], reverse=True)
        return similarities[:top_k]
        
    except Exception as e:
        logger.error(f"Error retrieving chunks: {e}")
        return []
