# 🚀 Advanced Features & Roadmap

Future enhancements and advanced capabilities for MySmartNotes.

## Table of Contents

1. [Spaced Repetition System](#spaced-repetition-system)
2. [Mind Maps & Visual Learning](#mind-maps--visual-learning)
3. [Note Linking & Knowledge Graph](#note-linking--knowledge-graph)
4. [Customizable Templates](#customizable-templates)
5. [Progress Analytics](#progress-analytics)
6. [Collaborative Features](#collaborative-features)
7. [Mobile App (PWA)](#mobile-app-pwa)
8. [Import/Export](#importexport)
9. [AI Enhancements](#ai-enhancements)
10. [Future Roadmap](#future-roadmap)

---

## Spaced Repetition System

### SM-2 Algorithm Implementation

Spaced repetition helps students remember information by scheduling reviews at optimal intervals.

**Database Schema:**

```python
# models/flashcards.py
class FlashcardReview(Base):
    __tablename__ = "flashcard_reviews"
    
    id = Column(Integer, primary_key=True)
    flashcard_id = Column(Integer, ForeignKey("flashcards.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    
    # SM-2 Algorithm fields
    easiness_factor = Column(Float, default=2.5)  # 1.3 - 2.5+
    repetition_number = Column(Integer, default=0)
    interval_days = Column(Integer, default=0)
    
    # Review history
    reviewed_at = Column(DateTime, default=datetime.utcnow)
    quality = Column(Integer)  # 0-5 (0=complete blackout, 5=perfect recall)
    next_review_date = Column(DateTime)
    
    flashcard = relationship("Flashcard", back_populates="reviews")
    user = relationship("User")
```

**SM-2 Algorithm:**

```python
# services/api_gateway/utils/spaced_repetition.py
from datetime import datetime, timedelta

class SM2Algorithm:
    """
    SuperMemo 2 (SM-2) Algorithm for spaced repetition.
    
    Quality ratings:
    5 - perfect response
    4 - correct response after a hesitation
    3 - correct response recalled with serious difficulty
    2 - incorrect response; where the correct one seemed easy to recall
    1 - incorrect response; the correct one remembered
    0 - complete blackout
    """
    
    @staticmethod
    def calculate_next_review(
        quality: int,
        easiness_factor: float = 2.5,
        repetition_number: int = 0,
        interval_days: int = 0
    ) -> dict:
        """Calculate next review date and update parameters."""
        
        # Update easiness factor
        new_ef = easiness_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
        new_ef = max(1.3, new_ef)  # Minimum easiness factor is 1.3
        
        # If quality < 3, reset repetition
        if quality < 3:
            new_repetition = 0
            new_interval = 0
        else:
            new_repetition = repetition_number + 1
            
            if new_repetition == 1:
                new_interval = 1  # Review in 1 day
            elif new_repetition == 2:
                new_interval = 6  # Review in 6 days
            else:
                new_interval = int(interval_days * new_ef)
        
        next_review_date = datetime.utcnow() + timedelta(days=new_interval)
        
        return {
            "easiness_factor": new_ef,
            "repetition_number": new_repetition,
            "interval_days": new_interval,
            "next_review_date": next_review_date
        }

# API endpoint
@router.post("/flashcards/{flashcard_id}/review")
async def review_flashcard(
    flashcard_id: int,
    quality: int = Body(..., ge=0, le=5),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Submit flashcard review with quality rating."""
    
    # Get last review
    last_review = db.query(FlashcardReview).filter(
        FlashcardReview.flashcard_id == flashcard_id,
        FlashcardReview.user_id == current_user.id
    ).order_by(FlashcardReview.reviewed_at.desc()).first()
    
    # Calculate next review
    if last_review:
        sm2_result = SM2Algorithm.calculate_next_review(
            quality=quality,
            easiness_factor=last_review.easiness_factor,
            repetition_number=last_review.repetition_number,
            interval_days=last_review.interval_days
        )
    else:
        sm2_result = SM2Algorithm.calculate_next_review(quality=quality)
    
    # Create review record
    review = FlashcardReview(
        flashcard_id=flashcard_id,
        user_id=current_user.id,
        quality=quality,
        **sm2_result
    )
    db.add(review)
    db.commit()
    
    return {
        "next_review_date": review.next_review_date,
        "interval_days": review.interval_days
    }

@router.get("/flashcards/due")
async def get_due_flashcards(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get flashcards due for review."""
    
    # Get all flashcards with their latest review
    subquery = db.query(
        FlashcardReview.flashcard_id,
        func.max(FlashcardReview.next_review_date).label('next_review')
    ).filter(
        FlashcardReview.user_id == current_user.id
    ).group_by(FlashcardReview.flashcard_id).subquery()
    
    due_flashcards = db.query(Flashcard).join(
        subquery,
        Flashcard.id == subquery.c.flashcard_id
    ).filter(
        subquery.c.next_review <= datetime.utcnow()
    ).all()
    
    # Also include new flashcards (never reviewed)
    new_flashcards = db.query(Flashcard).filter(
        Flashcard.user_id == current_user.id,
        ~Flashcard.id.in_(
            db.query(FlashcardReview.flashcard_id).filter(
                FlashcardReview.user_id == current_user.id
            )
        )
    ).limit(10).all()  # Limit new cards per session
    
    return {
        "due_flashcards": due_flashcards,
        "new_flashcards": new_flashcards,
        "total_due": len(due_flashcards) + len(new_flashcards)
    }
```

**Frontend Study Session:**

```python
# services/frontend/pages/study_session.py
import streamlit as st

def study_session():
    st.title("📚 Study Session")
    
    # Get due flashcards
    response = requests.get(
        f"{API_URL}/flashcards/due",
        headers={"Authorization": f"Bearer {st.session_state.token}"}
    )
    data = response.json()
    
    flashcards = data["due_flashcards"] + data["new_flashcards"]
    
    if not flashcards:
        st.success("🎉 No cards due for review! Come back later.")
        return
    
    st.write(f"**{data['total_due']} cards** due for review today")
    
    # Initialize session state
    if 'current_card_index' not in st.session_state:
        st.session_state.current_card_index = 0
        st.session_state.show_answer = False
    
    current_card = flashcards[st.session_state.current_card_index]
    
    # Show question
    st.markdown(f"### Question {st.session_state.current_card_index + 1}/{len(flashcards)}")
    st.info(current_card["question"])
    
    # Show/Hide answer button
    if not st.session_state.show_answer:
        if st.button("Show Answer"):
            st.session_state.show_answer = True
            st.rerun()
    else:
        # Show answer
        st.success(current_card["answer"])
        
        # Quality rating
        st.markdown("### How well did you remember?")
        
        col1, col2, col3 = st.columns(3)
        
        with col1:
            if st.button("❌ Forgot\n(Review soon)"):
                submit_review(current_card["id"], quality=0)
        
        with col2:
            if st.button("🤔 Hard\n(Review in 1 day)"):
                submit_review(current_card["id"], quality=3)
        
        with col3:
            if st.button("✅ Easy\n(Review later)"):
                submit_review(current_card["id"], quality=5)
        
        # Progress bar
        progress = (st.session_state.current_card_index + 1) / len(flashcards)
        st.progress(progress)

def submit_review(flashcard_id: int, quality: int):
    response = requests.post(
        f"{API_URL}/flashcards/{flashcard_id}/review",
        headers={"Authorization": f"Bearer {st.session_state.token}"},
        json={"quality": quality}
    )
    
    # Move to next card
    st.session_state.current_card_index += 1
    st.session_state.show_answer = False
    st.rerun()
```

---

## Mind Maps & Visual Learning

### Automatic Mind Map Generation

Generate visual mind maps from lecture content using AI to identify key concepts and relationships.

**Database Schema:**

```python
class MindMap(Base):
    __tablename__ = "mind_maps"
    
    id = Column(Integer, primary_key=True)
    lecture_id = Column(Integer, ForeignKey("lectures.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String)
    
    # Mind map structure (JSON)
    nodes = Column(JSON)  # [{"id": 1, "label": "Main Topic", "level": 0}]
    edges = Column(JSON)  # [{"from": 1, "to": 2, "label": "relationship"}]
    
    created_at = Column(DateTime, default=datetime.utcnow)
```

**AI Mind Map Generation:**

```python
# workers/tasks/generation.py
from networkx import DiGraph
import json

@celery_app.task
def generate_mind_map(lecture_id: int):
    """Generate mind map from lecture content."""
    
    # Get lecture text
    lecture = db.query(Lecture).get(lecture_id)
    full_text = " ".join([page.extracted_text for page in lecture.pages])
    
    # AI prompt to extract key concepts
    prompt = f"""
    Analyze the following lecture content and create a mind map structure.
    Identify:
    1. Main topic (root node)
    2. 3-5 subtopics (level 1 nodes)
    3. 2-3 concepts under each subtopic (level 2 nodes)
    4. Relationships between nodes
    
    Return as JSON:
    {{
        "nodes": [
            {{"id": 1, "label": "Main Topic", "level": 0}},
            {{"id": 2, "label": "Subtopic 1", "level": 1}},
            ...
        ],
        "edges": [
            {{"from": 1, "to": 2, "label": "contains"}},
            ...
        ]
    }}
    
    Lecture content:
    {full_text[:3000]}
    """
    
    # Call Ollama
    response = requests.post(
        f"{OLLAMA_URL}/api/generate",
        json={
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False
        }
    )
    
    mind_map_json = json.loads(response.json()["response"])
    
    # Save mind map
    mind_map = MindMap(
        lecture_id=lecture_id,
        user_id=lecture.user_id,
        title=f"Mind Map: {lecture.title}",
        nodes=mind_map_json["nodes"],
        edges=mind_map_json["edges"]
    )
    db.add(mind_map)
    db.commit()
    
    return {"mind_map_id": mind_map.id}
```

**Interactive Visualization (Frontend):**

```python
# services/frontend/components/mind_map.py
import streamlit as st
from streamlit_agraph import agraph, Node, Edge, Config

def display_mind_map(mind_map_data: dict):
    """Display interactive mind map using agraph."""
    
    nodes = []
    edges = []
    
    # Convert to agraph format
    for node in mind_map_data["nodes"]:
        color = "#FF6B6B" if node["level"] == 0 else "#4ECDC4" if node["level"] == 1 else "#95E1D3"
        
        nodes.append(Node(
            id=str(node["id"]),
            label=node["label"],
            size=400 - (node["level"] * 100),
            color=color
        ))
    
    for edge in mind_map_data["edges"]:
        edges.append(Edge(
            source=str(edge["from"]),
            target=str(edge["to"]),
            label=edge.get("label", ""),
            type="CURVE_SMOOTH"
        ))
    
    config = Config(
        width=800,
        height=600,
        directed=True,
        physics=True,
        hierarchical=False
    )
    
    agraph(nodes=nodes, edges=edges, config=config)
```

---

## Note Linking & Knowledge Graph

### Bi-directional Note Links

Link related concepts across different lectures to build a knowledge graph.

**Database Schema:**

```python
class NoteLink(Base):
    __tablename__ = "note_links"
    
    id = Column(Integer, primary_key=True)
    source_lecture_id = Column(Integer, ForeignKey("lectures.id"))
    target_lecture_id = Column(Integer, ForeignKey("lectures.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    
    # Link metadata
    link_type = Column(String)  # "related", "prerequisite", "continuation"
    description = Column(Text)
    similarity_score = Column(Float)  # AI-computed similarity
    
    created_at = Column(DateTime, default=datetime.utcnow)
```

**AI-Powered Link Discovery:**

```python
@celery_app.task
def discover_note_links(lecture_id: int):
    """Automatically suggest links to related lectures."""
    
    # Get current lecture embeddings
    lecture = db.query(Lecture).get(lecture_id)
    
    # Query ChromaDB for similar lectures
    results = chroma_collection.query(
        query_embeddings=[lecture.embedding],
        n_results=5
    )
    
    # Create suggested links
    for i, similar_id in enumerate(results["ids"][0]):
        if similar_id != lecture_id:
            similarity_score = 1 - results["distances"][0][i]
            
            # Only suggest if similarity > 0.7
            if similarity_score > 0.7:
                link = NoteLink(
                    source_lecture_id=lecture_id,
                    target_lecture_id=similar_id,
                    user_id=lecture.user_id,
                    link_type="related",
                    similarity_score=similarity_score,
                    description=f"Auto-discovered link (similarity: {similarity_score:.2f})"
                )
                db.add(link)
    
    db.commit()
```

---

## Customizable Templates

### Document Generation Templates

Allow users to customize output formats for study notes, summaries, and quizzes.

**Template System:**

```python
# models/templates.py
class DocumentTemplate(Base):
    __tablename__ = "document_templates"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    name = Column(String)
    template_type = Column(String)  # "notes", "summary", "quiz"
    
    # Template content (Jinja2)
    template_content = Column(Text)
    
    # Styling
    font_family = Column(String, default="Arial")
    font_size = Column(Integer, default=12)
    header_color = Column(String, default="#000000")
    
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
```

**Example Templates:**

```python
# Default summary template
SUMMARY_TEMPLATE = """
# {{ lecture_title }}

## Summary
{{ summary }}

## Key Points
{% for point in key_points %}
- {{ point }}
{% endfor %}

## Important Concepts
{% for concept in concepts %}
### {{ concept.name }}
{{ concept.description }}
{% endfor %}
"""

# Modern minimal template
MINIMAL_TEMPLATE = """
{{ lecture_title }}
═══════════════════════════════════════

📝 Summary
{{ summary }}

💡 Key Takeaways
{% for point in key_points %}
  • {{ point }}
{% endfor %}
"""

# Academic template
ACADEMIC_TEMPLATE = """
\\documentclass{article}
\\begin{document}

\\title{{ lecture_title }}
\\date{\\today}
\\maketitle

\\section{Summary}
{{ summary }}

\\section{Key Concepts}
\\begin{itemize}
{% for point in key_points %}
\\item {{ point }}
{% endfor %}
\\end{itemize}

\\end{document}
```

---

## Progress Analytics

### Learning Analytics Dashboard

Track student progress, identify weak areas, and provide personalized recommendations.

**Analytics Schema:**

```python
class StudySession(Base):
    __tablename__ = "study_sessions"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    subject_id = Column(Integer, ForeignKey("subjects.id"))
    
    # Session details
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime)
    duration_minutes = Column(Integer)
    
    # Activities
    flashcards_reviewed = Column(Integer, default=0)
    questions_asked = Column(Integer, default=0)
    pages_viewed = Column(Integer, default=0)
    
    # Performance
    avg_flashcard_quality = Column(Float)
    topics_covered = Column(JSON)
```

**Analytics Endpoints:**

```python
@router.get("/analytics/overview")
async def get_analytics_overview(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user learning analytics overview."""
    
    # Study time per subject (last 30 days)
    study_time = db.query(
        Subject.name,
        func.sum(StudySession.duration_minutes).label('total_minutes')
    ).join(StudySession).filter(
        StudySession.user_id == current_user.id,
        StudySession.started_at >= datetime.utcnow() - timedelta(days=30)
    ).group_by(Subject.name).all()
    
    # Flashcard performance
    flashcard_stats = db.query(
        func.avg(FlashcardReview.quality).label('avg_quality'),
        func.count(FlashcardReview.id).label('total_reviews')
    ).filter(
        FlashcardReview.user_id == current_user.id,
        FlashcardReview.reviewed_at >= datetime.utcnow() - timedelta(days=30)
    ).first()
    
    # Weak topics (low flashcard scores)
    weak_topics = db.query(
        Flashcard.topic,
        func.avg(FlashcardReview.quality).label('avg_quality')
    ).join(FlashcardReview).filter(
        FlashcardReview.user_id == current_user.id
    ).group_by(Flashcard.topic).having(
        func.avg(FlashcardReview.quality) < 3.0
    ).all()
    
    return {
        "study_time_by_subject": [
            {"subject": name, "minutes": minutes}
            for name, minutes in study_time
        ],
        "flashcard_performance": {
            "avg_quality": flashcard_stats.avg_quality,
            "total_reviews": flashcard_stats.total_reviews
        },
        "weak_topics": [
            {"topic": topic, "avg_quality": quality}
            for topic, quality in weak_topics
        ],
        "recommendations": generate_recommendations(weak_topics)
    }

def generate_recommendations(weak_topics):
    """Generate personalized study recommendations."""
    recommendations = []
    
    for topic, quality in weak_topics:
        if quality < 2.0:
            recommendations.append({
                "type": "urgent_review",
                "message": f"Review '{topic}' - significant difficulty detected",
                "action": "review_flashcards",
                "topic": topic
            })
        elif quality < 3.0:
            recommendations.append({
                "type": "practice_more",
                "message": f"Practice '{topic}' more frequently",
                "action": "generate_quiz",
                "topic": topic
            })
    
    return recommendations
```

---

## Collaborative Features

### Shared Study Groups

Allow users to create study groups, share notes, and collaborate.

**Schema:**

```python
class StudyGroup(Base):
    __tablename__ = "study_groups"
    
    id = Column(Integer, primary_key=True)
    name = Column(String)
    description = Column(Text)
    creator_id = Column(Integer, ForeignKey("users.id"))
    invite_code = Column(String, unique=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    members = relationship("GroupMember", back_populates="group")
    shared_resources = relationship("SharedResource", back_populates="group")

class GroupMember(Base):
    __tablename__ = "group_members"
    
    id = Column(Integer, primary_key=True)
    group_id = Column(Integer, ForeignKey("study_groups.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    role = Column(String, default="member")  # "admin", "member"
    joined_at = Column(DateTime, default=datetime.utcnow)
```

---

## Mobile App (PWA)

### Progressive Web App Configuration

**manifest.json:**

```json
{
  "name": "MySmartNotes",
  "short_name": "SmartNotes",
  "description": "AI-powered study companion",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#4ECDC4",
  "icons": [
    {
      "src": "/static/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/static/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ],
  "orientation": "portrait"
}
```

**Service Worker for Offline Support:**

```javascript
// static/sw.js
const CACHE_NAME = 'mysmartnotes-v1';
const urlsToCache = [
  '/',
  '/static/css/main.css',
  '/static/js/app.js',
  '/static/icon-192.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
```

---

## Import/Export

### Bulk Import from Other Tools

Support importing notes from Notion, Evernote, Anki, etc.

**Import Endpoints:**

```python
@router.post("/import/anki")
async def import_anki_deck(
    file: UploadFile,
    current_user: User = Depends(get_current_user)
):
    """Import Anki .apkg deck."""
    
    import zipfile
    import sqlite3
    
    # Extract .apkg (zip file)
    with zipfile.ZipFile(file.file) as z:
        z.extractall("/tmp/anki_import")
    
    # Read Anki database
    conn = sqlite3.connect("/tmp/anki_import/collection.anki2")
    cursor = conn.execute("SELECT * FROM cards")
    
    # Convert to flashcards
    for row in cursor:
        flashcard = Flashcard(
            user_id=current_user.id,
            question=row[1],
            answer=row[2],
            # ... map other fields
        )
        db.add(flashcard)
    
    db.commit()
    return {"imported": cursor.rowcount}
```

---

## AI Enhancements

### Multi-Model Support

Allow users to choose different AI models for different tasks.

```python
AVAILABLE_MODELS = {
    "llama3:8b": {"speed": "fast", "quality": "good", "size": "8GB"},
    "llama3:70b": {"speed": "slow", "quality": "excellent", "size": "40GB"},
    "mistral:7b": {"speed": "fast", "quality": "good", "size": "7GB"},
}

@router.post("/chat", dependencies=[Depends(RateLimiter(times=60, seconds=60))])
async def chat(
    request: ChatRequest,
    model: str = "llama3:8b",
    current_user: User = Depends(get_current_user)
):
    # Use selected model
    response = requests.post(
        f"{OLLAMA_URL}/api/generate",
        json={"model": model, "prompt": request.message}
    )
    # ...
```

---

## Future Roadmap

### Phase 1: Core Enhancements (Q1 2026)
- ✅ Spaced repetition system (SM-2)
- ✅ Mind map generation
- ⏳ Mobile PWA
- ⏳ Template customization

### Phase 2: Collaboration (Q2 2026)
- Study groups
- Real-time collaboration
- Shared flashcard decks
- Discussion forums

### Phase 3: Advanced AI (Q3 2026)
- Multi-model support
- Voice input/output
- Automatic quiz generation from any content
- Personalized learning paths

### Phase 4: Platform Expansion (Q4 2026)
- Native mobile apps (React Native)
- Browser extensions
- Integration with LMS (Canvas, Moodle, Blackboard)
- API for third-party integrations

---

For implementation details, see [DEVELOPMENT.md](DEVELOPMENT.md).  
For deployment of new features, see [DEPLOYMENT.md](DEPLOYMENT.md).
