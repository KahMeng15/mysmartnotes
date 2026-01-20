# Quick Start Guide - MySmartNotes

## 🚀 Get Running in 2 Minutes

### Prerequisites
- Python 3.11+
- Docker (optional, for containerized setup)

### Option 1: Python (Easiest)

```bash
# 1. Go to project directory
cd /Users/kahmeng/Documents/GitHub/mysmartnotes

# 2. Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Set up environment variables
cp .env.example .env

# Edit .env and add:
# - GEMINI_API_KEY (get from https://makersuite.google.com)
# - Or HUGGINGFACE_TOKEN (get from https://huggingface.co/settings/tokens)

# 5. Run the app
python main.py
```

Visit: http://localhost:8000

### Option 2: Docker

```bash
# 1. Go to project directory
cd /Users/kahmeng/Documents/GitHub/mysmartnotes

# 2. Set up environment
cp .env.example .env
# Edit .env with your API keys

# 3. Build and run
docker-compose up --build

# Or without building:
docker-compose up
```

Visit: http://localhost:8000

## 📝 First Steps in the App

1. **Create an account** - Click "Sign Up" and fill in your details
2. **Log in** - Use your credentials to access the dashboard
3. **Create a subject** - Organize your notes by subject/course
4. **Upload a lecture** - Upload a PDF or PowerPoint file
5. **Ask questions** - Use the chat feature to ask about your notes
6. **Generate resources** - Create cheatsheets and quizzes

## 🔑 Environment Variables

Required for the app to work:

```env
# Must set ONE of these:
GEMINI_API_KEY=your-key-here     # Free tier available
HUGGINGFACE_TOKEN=your-token     # Free tier available

# Optional (has defaults):
DATABASE_URL=sqlite:///./data/app.db
SECRET_KEY=change-in-production
DEBUG=False
PORT=8000
```

## 📚 API Endpoints

- `GET /` - Health check
- `POST /auth/register` - Create account
- `POST /auth/login` - Login (returns JWT token)
- `GET /docs` - API documentation (Swagger UI)
- `GET /redoc` - API documentation (ReDoc)

## 🛠️ Troubleshooting

### Port 8000 already in use
```bash
# Use a different port
python main.py --port 8001
# Or kill the process using port 8000
lsof -i :8000
kill -9 <PID>
```

### Database locked
```bash
# SQLite sometimes locks, just restart the app
# Delete data/app.db and restart if completely stuck
rm data/app.db
```

### Missing dependencies
```bash
# Reinstall requirements
pip install -r requirements.txt --force-reinstall
```

### API key errors
- Check `.env` file has correct key format
- Verify API key is active on Gemini/HuggingFace console
- Restart the app after changing `.env`

## 📁 Project Structure

```
mysmartnotes/
├── app/
│   ├── routers/          # API endpoints
│   ├── models/           # Database models
│   ├── schemas/          # Request/response schemas
│   ├── processing/       # AI, embeddings, OCR
│   ├── utils/            # Auth, database, WebSocket
│   └── static/           # Frontend HTML/CSS/JS
├── data/                 # SQLite database, uploads
├── main.py              # Entry point
├── config.py            # Configuration
├── requirements.txt     # Dependencies
├── Dockerfile           # Container definition
└── docker-compose.yml   # Docker setup
```

## 📖 Documentation

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - System design
- [DATABASE.md](docs/DATABASE.md) - Data schema
- [DEVELOPMENT.md](docs/DEVELOPMENT.md) - Development setup
- [DEPLOYMENT.md](docs/DEPLOYMENT.md) - Production deployment

## 🎯 What's Currently Working

✅ User registration and login
✅ Database initialization
✅ API documentation at /docs
✅ JWT token authentication
✅ WebSocket infrastructure

## 🚧 What's Being Built

⏳ Subject and lecture management
⏳ File upload and OCR
⏳ AI chat and Q&A
⏳ Document generation
⏳ Flashcard system
⏳ Dashboard UI

## 💡 Tips

- Use `/docs` to test API endpoints
- Check `data/app.db` file size to see if data is being saved
- Enable `DEBUG=True` in `.env` for auto-reload during development
- WebSocket requires connecting to `/ws/{user_id}` for real-time updates

## 🆘 Need Help?

Check [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for common issues
