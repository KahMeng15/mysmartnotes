# 🗄️ Database Structure

Complete database schemas and relationships for MySmartNotes.

## Database Overview

MySmartNotes uses three database systems:

1. **PostgreSQL** - Primary relational database for user data, metadata
2. **ChromaDB** - Vector database for embeddings and semantic search
3. **Redis** - In-memory cache and message broker

---

## PostgreSQL Schema

### ER Diagram

```
┌─────────────┐
│    users    │
└──────┬──────┘
       │ 1
       │
       │ n
┌──────▼──────┐
│  subjects   │
└──────┬──────┘
       │ 1
       │
       │ n
┌──────▼──────┐       ┌─────────────────┐
│  lectures   │◄──────┤ share_links     │
└──────┬──────┘  n:1  └─────────────────┘
       │ 1
       │
       │ n
┌──────▼──────────────┐
│ generated_documents │
└─────────────────────┘
```

### Table: `users`

Stores user account information.

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP
);

-- Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_active ON users(is_active) WHERE is_active = TRUE;
```

**Columns:**
- `id` - Primary key
- `username` - Unique username for login
- `email` - User email address
- `password_hash` - Bcrypt hashed password
- `full_name` - User's display name
- `is_active` - Account active status
- `is_verified` - Email verification status
- `created_at` - Account creation timestamp
- `updated_at` - Last account update
- `last_login` - Last successful login

---

### Table: `subjects`

Stores subject/course information.

```sql
CREATE TABLE subjects (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(7),  -- Hex color for UI display (e.g., #FF5733)
    icon VARCHAR(50),  -- Icon identifier (e.g., 'book', 'science')
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT unique_user_subject UNIQUE(user_id, name)
);

-- Indexes
CREATE INDEX idx_subjects_user_id ON subjects(user_id);
CREATE INDEX idx_subjects_created_at ON subjects(created_at DESC);
```

**Columns:**
- `id` - Primary key
- `user_id` - Foreign key to users table
- `name` - Subject name (e.g., "Physics 101", "Biology")
- `description` - Optional subject description
- `color` - UI color code for visual identification
- `icon` - Icon identifier for UI display
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

**Constraints:**
- One user cannot have duplicate subject names

---

### Table: `lectures`

Stores lecture/slide upload information.

```sql
CREATE TABLE lectures (
    id SERIAL PRIMARY KEY,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    file_name VARCHAR(512),
    file_path VARCHAR(1024),
    file_size BIGINT,  -- Size in bytes
    file_type VARCHAR(50),  -- 'pdf', 'pptx'
    page_count INTEGER,
    status VARCHAR(50) DEFAULT 'pending',  -- pending, processing, completed, failed
    error_message TEXT,  -- Error details if status = failed
    uploaded_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP,
    processing_time INTEGER,  -- Duration in seconds
    metadata JSONB  -- Additional metadata (DPI, resolution, etc.)
);

-- Indexes
CREATE INDEX idx_lectures_subject_id ON lectures(subject_id);
CREATE INDEX idx_lectures_status ON lectures(status);
CREATE INDEX idx_lectures_uploaded_at ON lectures(uploaded_at DESC);
CREATE INDEX idx_lectures_metadata ON lectures USING GIN(metadata);
```

**Columns:**
- `id` - Primary key
- `subject_id` - Foreign key to subjects table
- `name` - Lecture name/title
- `description` - Optional lecture description
- `file_name` - Original filename
- `file_path` - Storage path on disk
- `file_size` - File size in bytes
- `file_type` - File type (pdf/pptx)
- `page_count` - Number of pages/slides
- `status` - Processing status
- `error_message` - Error details if failed
- `uploaded_at` - Upload timestamp
- `processed_at` - Processing completion timestamp
- `processing_time` - Time taken to process
- `metadata` - Additional JSON metadata

**Status Values:**
- `pending` - Uploaded, waiting for processing
- `processing` - Currently being processed
- `completed` - Successfully processed
- `failed` - Processing failed

---

### Table: `generated_documents`

Stores generated document metadata (cheat sheets, quizzes, etc.).

```sql
CREATE TABLE generated_documents (
    id SERIAL PRIMARY KEY,
    lecture_id INTEGER NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
    doc_type VARCHAR(50) NOT NULL,  -- cheat_sheet, quiz, flashcards, past_paper
    file_name VARCHAR(512),
    file_path VARCHAR(1024),
    file_size BIGINT,
    format VARCHAR(50),  -- docx, pdf, json
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB  -- Document-specific metadata (page_count, settings, etc.)
);

-- Indexes
CREATE INDEX idx_gendocs_lecture_id ON generated_documents(lecture_id);
CREATE INDEX idx_gendocs_type ON generated_documents(doc_type);
CREATE INDEX idx_gendocs_created_at ON generated_documents(created_at DESC);
CREATE INDEX idx_gendocs_metadata ON generated_documents USING GIN(metadata);
```

**Columns:**
- `id` - Primary key
- `lecture_id` - Foreign key to lectures table
- `doc_type` - Type of generated document
- `file_name` - Generated filename
- `file_path` - Storage path
- `file_size` - File size in bytes
- `format` - File format
- `version` - Version number (for regeneration)
- `created_at` - Generation timestamp
- `metadata` - Document-specific metadata

**Document Types:**
- `cheat_sheet` - Condensed study guide
- `quiz` - MCQ quiz
- `flashcards` - Flashcard deck
- `past_paper` - Past paper answers

---

### Table: `share_links`

Stores shareable links for lectures and documents.

```sql
CREATE TABLE share_links (
    id SERIAL PRIMARY KEY,
    lecture_id INTEGER REFERENCES lectures(id) ON DELETE CASCADE,
    document_id INTEGER REFERENCES generated_documents(id) ON DELETE CASCADE,
    link_code VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),  -- Optional password protection
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP,
    max_views INTEGER,  -- Optional view limit
    view_count INTEGER DEFAULT 0,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    last_accessed TIMESTAMP,
    CONSTRAINT check_link_target CHECK (
        (lecture_id IS NOT NULL AND document_id IS NULL) OR
        (lecture_id IS NULL AND document_id IS NOT NULL)
    )
);

-- Indexes
CREATE INDEX idx_share_links_code ON share_links(link_code);
CREATE INDEX idx_share_links_active ON share_links(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_share_links_expires ON share_links(expires_at);
```

**Columns:**
- `id` - Primary key
- `lecture_id` - Link to entire lecture (optional)
- `document_id` - Link to specific document (optional)
- `link_code` - Unique URL code
- `password_hash` - Optional password protection
- `is_active` - Link active status
- `expires_at` - Optional expiration date
- `max_views` - Optional view limit
- `view_count` - Number of times accessed
- `created_by` - User who created the link
- `created_at` - Creation timestamp
- `last_accessed` - Last access timestamp

---

### Table: `flashcards`

Stores flashcards for spaced repetition.

```sql
CREATE TABLE flashcards (
    id SERIAL PRIMARY KEY,
    lecture_id INTEGER NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    card_type VARCHAR(50) DEFAULT 'basic',  -- basic, cloze, multiple_choice
    difficulty INTEGER DEFAULT 0,  -- SM-2 difficulty rating
    interval INTEGER DEFAULT 0,  -- Days until next review
    repetitions INTEGER DEFAULT 0,  -- Number of successful reviews
    ease_factor FLOAT DEFAULT 2.5,  -- SM-2 ease factor
    next_review TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    last_reviewed TIMESTAMP,
    metadata JSONB  -- Additional card data (hints, images, etc.)
);

-- Indexes
CREATE INDEX idx_flashcards_lecture_id ON flashcards(lecture_id);
CREATE INDEX idx_flashcards_next_review ON flashcards(next_review) WHERE next_review IS NOT NULL;
CREATE INDEX idx_flashcards_created_at ON flashcards(created_at DESC);
```

**Columns:**
- `id` - Primary key
- `lecture_id` - Foreign key to lectures table
- `question` - Front of card
- `answer` - Back of card
- `card_type` - Type of flashcard
- `difficulty` - SM-2 difficulty rating
- `interval` - Days until next review
- `repetitions` - Successful review count
- `ease_factor` - SM-2 ease factor
- `next_review` - Next scheduled review
- `created_at` - Creation timestamp
- `last_reviewed` - Last review timestamp
- `metadata` - Additional card data

---

### Table: `study_sessions`

Tracks study session history and analytics.

```sql
CREATE TABLE study_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
    lecture_id INTEGER REFERENCES lectures(id) ON DELETE CASCADE,
    session_type VARCHAR(50) NOT NULL,  -- chat, quiz, flashcards, revision
    duration INTEGER,  -- Duration in seconds
    score FLOAT,  -- Quiz/flashcard score (0-100)
    items_completed INTEGER,  -- Questions answered, cards reviewed, etc.
    started_at TIMESTAMP DEFAULT NOW(),
    ended_at TIMESTAMP,
    metadata JSONB  -- Session-specific data (questions, responses, etc.)
);

-- Indexes
CREATE INDEX idx_study_sessions_user_id ON study_sessions(user_id);
CREATE INDEX idx_study_sessions_subject_id ON study_sessions(subject_id);
CREATE INDEX idx_study_sessions_started_at ON study_sessions(started_at DESC);
CREATE INDEX idx_study_sessions_type ON study_sessions(session_type);
```

**Columns:**
- `id` - Primary key
- `user_id` - User who performed session
- `subject_id` - Related subject (optional)
- `lecture_id` - Related lecture (optional)
- `session_type` - Type of study session
- `duration` - Session duration in seconds
- `score` - Performance score
- `items_completed` - Number of items completed
- `started_at` - Session start
- `ended_at` - Session end
- `metadata` - Session-specific data

---

## ChromaDB Structure

ChromaDB stores vector embeddings for semantic search (RAG).

### Collections

Each subject has its own collection for isolation and performance.

```python
# Collection naming convention
collection_name = f"subject_{subject_id}"

# Collection metadata
metadata = {
    "subject_id": int,
    "subject_name": str,
    "created_at": timestamp,
    "model": "llama3:8b-instruct-q4_0"
}
```

### Document Structure

```python
{
    "id": "lecture_{lecture_id}_page_{page}_chunk_{chunk_id}",
    "embedding": [0.1, 0.2, ..., 0.768],  # 768-dimensional vector
    "metadata": {
        "lecture_id": int,
        "lecture_name": str,
        "page_number": int,
        "chunk_index": int,
        "content": str,  # Original text chunk
        "content_type": str,  # "text", "heading", "list", "table"
        "figures": list,  # References to related figures
        "created_at": timestamp
    }
}
```

### Metadata Filters

Common queries use metadata filters:

```python
# Get chunks for specific lecture
collection.query(
    query_embeddings=query_vector,
    where={"lecture_id": 123},
    n_results=5
)

# Get chunks for specific page
collection.query(
    query_embeddings=query_vector,
    where={"lecture_id": 123, "page_number": 5},
    n_results=5
)

# Get only headings
collection.query(
    query_embeddings=query_vector,
    where={"content_type": "heading"},
    n_results=10
)
```

---

## Redis Structure

Redis is used for caching, sessions, and message queuing.

### Database Assignments

```
DB 0: Celery broker (task queue)
DB 1: Celery results (task results)
DB 2: Application cache
DB 3: User sessions
DB 4: Rate limiting
DB 5: Pub/Sub (WebSocket messages)
```

### Key Patterns

#### Cache Keys

```
# User data
user:{user_id}                          # User profile cache
user:{user_id}:subjects                 # User's subjects list
user:{user_id}:sessions                 # Active sessions

# Subject data
subject:{subject_id}                    # Subject details
subject:{subject_id}:lectures           # Lectures in subject

# Lecture data
lecture:{lecture_id}                    # Lecture details
lecture:{lecture_id}:status             # Processing status
lecture:{lecture_id}:progress           # Processing progress (0-100)

# Query cache
query:{hash}                            # RAG query results
query:{hash}:timestamp                  # Cache timestamp
```

#### Session Keys

```
session:{session_id}                    # Session data
session:{session_id}:user_id            # User ID for session
```

#### Rate Limiting Keys

```
ratelimit:{user_id}:{endpoint}:{window} # Request count in time window
```

#### Task Queue Keys

```
celery-task-meta-{task_id}             # Task result
_kombu.binding.*                        # Celery queue bindings
```

### TTL (Time To Live)

```python
# Cache expiration times
USER_CACHE_TTL = 3600           # 1 hour
SUBJECT_CACHE_TTL = 1800        # 30 minutes
LECTURE_CACHE_TTL = 1800        # 30 minutes
QUERY_CACHE_TTL = 1800          # 30 minutes
SESSION_TTL = 86400             # 24 hours
RATELIMIT_WINDOW = 60           # 1 minute
```

---

## Database Relationships

### One-to-Many Relationships

```
users (1) ──────> (N) subjects
subjects (1) ────> (N) lectures
lectures (1) ────> (N) generated_documents
lectures (1) ────> (N) flashcards
users (1) ───────> (N) study_sessions
```

### Optional Relationships

```
share_links ─────> lectures (optional)
share_links ─────> generated_documents (optional)
study_sessions ──> subjects (optional)
study_sessions ──> lectures (optional)
```

---

## Database Initialization

### Initial Setup Script

```sql
-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For fuzzy text search

-- Create enum types
CREATE TYPE processing_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE document_type AS ENUM ('cheat_sheet', 'quiz', 'flashcards', 'past_paper');
CREATE TYPE session_type AS ENUM ('chat', 'quiz', 'flashcards', 'revision');

-- Create all tables (shown above)
-- Create all indexes (shown above)

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subjects_updated_at BEFORE UPDATE ON subjects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## Backup and Maintenance

### Backup Strategy

```bash
# Daily full backup
pg_dump -U user -d mysmartnotes > backup_$(date +%Y%m%d).sql

# Backup specific tables
pg_dump -U user -d mysmartnotes -t users -t subjects > user_data_backup.sql

# Backup ChromaDB
tar -czf chroma_backup_$(date +%Y%m%d).tar.gz /data/chroma_db/

# Backup Redis (if persistence enabled)
redis-cli BGSAVE
cp /data/redis_data/dump.rdb ./backup/redis_$(date +%Y%m%d).rdb
```

### Maintenance Tasks

```sql
-- Vacuum and analyze (weekly)
VACUUM ANALYZE;

-- Reindex (monthly)
REINDEX DATABASE mysmartnotes;

-- Delete expired share links
DELETE FROM share_links 
WHERE expires_at < NOW() OR 
      (max_views IS NOT NULL AND view_count >= max_views);

-- Archive old study sessions (older than 1 year)
-- Move to separate archive table
```
