import json
from app.models.db import Quiz, QuizQuestion
from app.utils.db import SessionLocal

db = SessionLocal()
quizzes = db.query(Quiz).all()
result = []
for q in quizzes:
    questions = db.query(QuizQuestion).filter(QuizQuestion.quiz_id == q.id).all()
    result.append({
        "id": q.id,
        "title": q.title,
        "questions_count": len(questions)
    })

print(json.dumps(result, indent=2))
