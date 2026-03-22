
import sqlite3
import random
import string
import os

DB_PATH = "data/app.db"

def generate_random_id(length=8):
    return ''.join(random.choices(string.ascii_letters + string.digits, k=length))

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # 1. Create quiz_groups table
        print("Creating quiz_groups table...")
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS quiz_groups (
            id VARCHAR(8) PRIMARY KEY,
            user_id INTEGER NOT NULL,
            name VARCHAR(255) NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
        """)

        # 2. Check if quizzes already has the new structure (id as string)
        cursor.execute("PRAGMA table_info(quizzes)")
        columns = cursor.fetchall()
        id_col = next((c for c in columns if c[1] == 'id'), None)
        
        # If ID is INTEGER, we need to migrate the whole table structure
        if id_col and 'INTEGER' in id_col[2].upper():
            print("Migrating quizzes table to new structure (String IDs)...")
            
            # Create new table
            cursor.execute("""
            CREATE TABLE quizzes_new (
                id VARCHAR(8) PRIMARY KEY,
                user_id INTEGER NOT NULL,
                title VARCHAR(255) NOT NULL,
                scope_type VARCHAR(50),
                group_id VARCHAR(8),
                subject_id VARCHAR(8),
                lecture_id VARCHAR(8),
                quiz_group_id VARCHAR(8),
                model VARCHAR(100),
                processing_time_ms INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(group_id) REFERENCES subject_groups(id),
                FOREIGN KEY(subject_id) REFERENCES subjects(id),
                FOREIGN KEY(lecture_id) REFERENCES lectures(id),
                FOREIGN KEY(quiz_group_id) REFERENCES quiz_groups(id)
            )
            """)
            
            # Fetch old quizzes
            cursor.execute("SELECT id, user_id, title, scope_type, group_id, subject_id, lecture_id, model, processing_time_ms, created_at, updated_at FROM quizzes")
            old_quizzes = cursor.fetchall()
            
            quiz_id_map = {} # old_int_id -> new_str_id
            
            for old_q in old_quizzes:
                old_id = old_q[0]
                new_id = generate_random_id()
                quiz_id_map[old_id] = new_id
                
                # Insert into new table
                cursor.execute("""
                INSERT INTO quizzes_new (id, user_id, title, scope_type, group_id, subject_id, lecture_id, model, processing_time_ms, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (new_id, *old_q[1:]))
            
            # 3. Migrate QuizQuestions (update quiz_id foreign key)
            print("Updating quiz_questions...")
            cursor.execute("PRAGMA table_info(quiz_questions)")
            q_cols = [c[1] for c in cursor.fetchall()]
            
            # Create new quiz_questions table to change quiz_id type if needed
            cursor.execute("""
            CREATE TABLE quiz_questions_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                quiz_id VARCHAR(8) NOT NULL,
                question_text TEXT NOT NULL,
                answer_text TEXT NOT NULL,
                question_type VARCHAR(50) DEFAULT 'subjective',
                options JSON,
                "order" INTEGER DEFAULT 0,
                FOREIGN KEY(quiz_id) REFERENCES quizzes(id)
            )
            """)
            
            cursor.execute("SELECT quiz_id, question_text, answer_text, question_type, options, \"order\" FROM quiz_questions")
            for q_row in cursor.fetchall():
                old_qid = q_row[0]
                new_qid = quiz_id_map.get(old_qid, str(old_qid)) # Fallback if not mapped
                cursor.execute("""
                INSERT INTO quiz_questions_new (quiz_id, question_text, answer_text, question_type, options, "order")
                VALUES (?, ?, ?, ?, ?, ?)
                """, (new_qid, *q_row[1:]))

            # 4. Migrate QuizProgress
            print("Updating quiz_progress...")
            cursor.execute("""
            CREATE TABLE quiz_progress_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                quiz_id VARCHAR(8) NOT NULL,
                question_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                is_correct BOOLEAN DEFAULT 0,
                times_tested INTEGER DEFAULT 0,
                last_tested_at DATETIME,
                next_review_at DATETIME,
                last_reviewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                interval_days INTEGER DEFAULT 0,
                ease_factor FLOAT DEFAULT 2.5,
                consecutive_correct INTEGER DEFAULT 0,
                FOREIGN KEY(quiz_id) REFERENCES quizzes(id),
                FOREIGN KEY(question_id) REFERENCES quiz_questions(id),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """)
            
            cursor.execute("""
            SELECT quiz_id, question_id, user_id, is_correct, times_tested, last_tested_at, next_review_at, 
                   last_reviewed_at, interval_days, ease_factor, consecutive_correct 
            FROM quiz_progress
            """)
            for p_row in cursor.fetchall():
                old_qid = p_row[0]
                new_qid = quiz_id_map.get(old_qid, str(old_qid))
                cursor.execute("""
                INSERT INTO quiz_progress_new (quiz_id, question_id, user_id, is_correct, times_tested, last_tested_at, next_review_at, 
                                            last_reviewed_at, interval_days, ease_factor, consecutive_correct)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (new_qid, *p_row[1:]))

            # 5. Drop old tables and rename new ones
            print("Finalizing table renames...")
            cursor.execute("DROP TABLE quiz_progress")
            cursor.execute("ALTER TABLE quiz_progress_new RENAME TO quiz_progress")
            
            cursor.execute("DROP TABLE quiz_questions")
            cursor.execute("ALTER TABLE quiz_questions_new RENAME TO quiz_questions")
            
            cursor.execute("DROP TABLE quizzes")
            cursor.execute("ALTER TABLE quizzes_new RENAME TO quizzes")
            
        else:
            # Table already has String ID, just check for quiz_group_id column
            print("Quizzes table already has String ID. Checking for quiz_group_id column...")
            if not any(c[1] == 'quiz_group_id' for c in columns):
                print("Adding quiz_group_id column...")
                cursor.execute("ALTER TABLE quizzes ADD COLUMN quiz_group_id VARCHAR(8) REFERENCES quiz_groups(id)")

        conn.commit()
        print("Migration completed successfully!")

    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {e}")
        raise e
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
