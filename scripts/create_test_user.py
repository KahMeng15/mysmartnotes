"""Script to seed a test user and mock data (groups, subjects, notes, quizzes) for mobile visual testing."""
import sys
import os
from datetime import datetime

# Adjust path to import from app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.utils.db import SessionLocal, generate_random_id
from app.models.db import User, SubjectGroup, Subject, Lecture, Summary, Quiz, QuizQuestion
from app.utils.auth import hash_password, create_access_token
from app.utils.storage import StorageManager

def seed_data():
    db: Session = SessionLocal()
    try:
        # 1. Create or update test user
        email = "test@example.com"
        user = db.query(User).filter(User.email == email).first()
        
        if not user:
            print("Creating test user...")
            user = User(
                username="testuser",
                email=email,
                hashed_password=hash_password("Password123!"),
                full_name="Alex Student",
                nickname="Alex",
                is_active=True,
                is_admin=True,
                is_approved=True,
                is_verified=True,
                token_version=0
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            print("Test user already exists.")
            user.is_active = True
            user.is_approved = True
            user.is_verified = True
            user.is_admin = True
            db.commit()

        # Generate JWT Token
        token = create_access_token({"sub": str(user.id), "tv": user.token_version})
        print(f"JWT Token: {token}")

        # 2. Seed Subject Group
        group = db.query(SubjectGroup).filter(SubjectGroup.user_id == user.id).first()
        if not group:
            print("Creating subject group...")
            group = SubjectGroup(
                id=generate_random_id(db, SubjectGroup),
                user_id=user.id,
                name="Semester 1 - Computer Science"
            )
            db.add(group)
            db.commit()
            db.refresh(group)

        # 3. Seed Subject
        subject = db.query(Subject).filter(Subject.user_id == user.id).first()
        if not subject:
            print("Creating subject...")
            subject = Subject(
                id=generate_random_id(db, Subject),
                user_id=user.id,
                group_id=group.id,
                name="Introduction to Programming",
                description="Learn basic programming concepts using Python and JavaScript.",
                color="#593C8F"
            )
            db.add(subject)
            db.commit()
            db.refresh(subject)

        # 4. Seed Lecture (Note)
        lecture = db.query(Lecture).filter(Lecture.user_id == user.id).first()
        if not lecture:
            print("Creating lecture...")
            lecture = Lecture(
                id=generate_random_id(db, Lecture),
                user_id=user.id,
                subject_id=subject.id,
                title="Lecture 01: Python Basics & Variables",
                file_path="mock_lecture_01.pdf",
                file_name="Lecture_01_Python.pdf",
                file_type="pdf",
                file_size=1024 * 100,
                page_count=5
            )
            db.add(lecture)
            db.commit()
            db.refresh(lecture)

        # Seed local storage files for note content
        print("Saving lecture raw text and structured content to storage files...")
        lecture_markdown = """# Lecture 01: Python Basics & Variables

Welcome to the Introduction to Programming! In this lecture, we introduce the Python programming language, variables, and data types.

## 1. What is Python?
Python is a high-level, interpreted, general-purpose programming language. Its design philosophy emphasizes code readability with its use of significant indentation.

### Key Features:
- **Easy to learn**: Simple syntax similar to English.
- **Interpreted**: Code is executed line by line.
- **Versatile**: Used in web dev, data science, AI, etc.

## 2. Variables
Variables are containers for storing data values. In Python, you don't need to declare variable types.

```python
# Variables declaration
x = 5
name = "Alex"
is_student = True

print(f"{name} is studying Python. Level: {x}")
```

### Naming Rules:
1. Must start with a letter or underscore.
2. Cannot start with a number.
3. Only alpha-numeric characters and underscores.
4. Case-sensitive (`age`, `Age`, `AGE` are three different variables).

## 3. Data Types
Python has several built-in data types:

| Data Type | Example | Description |
| :--- | :--- | :--- |
| `str` | `"Hello"` | Text data type |
| `int` | `10` | Whole integers |
| `float` | `10.5` | Floating point numbers |
| `bool` | `True` / `False` | Boolean values |

---
Enjoy learning Python!
"""
        StorageManager.save_lecture_text(lecture.id, lecture_markdown)
        StorageManager.save_lecture_json(lecture.id, "structured", [
            {"content": "Lecture 01: Python Basics & Variables", "type": "h1", "page": 1},
            {"content": "Welcome to the Introduction to Programming! In this lecture, we introduce variables and data types.", "type": "paragraph", "page": 1},
            {"content": "What is Python?", "type": "h2", "page": 1},
            {"content": "Python is a high-level, interpreted, general-purpose programming language. Its design philosophy emphasizes code readability with its use of significant indentation.", "type": "paragraph", "page": 1},
            {"content": "Key Features:\n- Easy to learn\n- Interpreted\n- Versatile", "type": "list", "page": 1},
            {"content": "Variables", "type": "h2", "page": 2},
            {"content": "Variables are containers for storing data values.", "type": "paragraph", "page": 2},
            {"content": "# Variables declaration\nx = 5\nname = \"Alex\"\nis_student = True", "type": "code", "page": 2},
            {"content": "Data Types", "type": "h2", "page": 3},
            {"content": "Python has several built-in data types: string, integer, float, boolean.", "type": "paragraph", "page": 3}
        ])

        # 5. Seed Summary (Note Content)
        summary = db.query(Summary).filter(Summary.lecture_id == lecture.id).first()
        if not summary:
            print("Creating lecture summary note content...")
            summary_content_dir = os.path.join("data", "summaries")
            os.makedirs(summary_content_dir, exist_ok=True)
            summary_file_name = f"{lecture.id}_summary.md"
            summary_file_path = os.path.join(summary_content_dir, summary_file_name)
            
            with open(summary_file_path, "w") as f:
                f.write(lecture_markdown)

            summary = Summary(
                id=generate_random_id(db, Summary),
                lecture_id=lecture.id,
                summary_type="summary",
                title="Lecture 01 Summary Notes",
                file_path=summary_file_path,
                mode="elaborate",
                output_format="pointform",
                version=1
            )
            db.add(summary)
            db.commit()
            db.refresh(summary)

        # 6. Seed Quiz
        quiz = db.query(Quiz).filter(Quiz.user_id == user.id).first()
        if not quiz:
            print("Creating quiz...")
            quiz = Quiz(
                id=generate_random_id(db, Quiz),
                user_id=user.id,
                title="Python Basics Quiz",
                scope_type="lecture",
                lecture_id=lecture.id,
                subject_id=subject.id,
                group_id=group.id
            )
            db.add(quiz)
            db.commit()
            db.refresh(quiz)

            # Questions
            q1 = QuizQuestion(
                quiz_id=quiz.id,
                question_text="Which of the following is a valid Python variable name?",
                answer_text="1_variable_name",
                question_type="objective",
                options=["1_variable_name", "_variable_name", "variable-name", "import"],
                order=1,
                explanation="Variable names cannot start with numbers, contain hyphens, or use reserved words like 'import'."
            )
            q2 = QuizQuestion(
                quiz_id=quiz.id,
                question_text="Is Python an interpreted language? (True/False)",
                answer_text="True",
                question_type="objective",
                options=["True", "False"],
                order=2,
                explanation="Yes, Python is an interpreted language, meaning the code is executed line-by-line by the interpreter."
            )
            db.add_all([q1, q2])
            db.commit()

        print("Database seeded successfully with test records!")
        print(f"User: {email}")
        print(f"Password: Password123!")
        print(f"Lecture ID: {lecture.id}")
        print(f"Quiz ID: {quiz.id}")
        
    finally:
        db.close()

if __name__ == "__main__":
    seed_data()
