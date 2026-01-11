# 🚀 Project Name: "MySmartNotes" – AI Study Companion

## 1. Project Overview

A local web application that converts lecture slides (PDF/PPTX) into high-density "Exam Cheat Sheets" (MS Word). It features a "Smart Crop" system for diagrams, a Chatbot (RAG) for Q&A, a Quiz Generator, and shareable links for collaboration.

**New Feature: Subject & Note Organization**

* Users can create and manage "Subjects" (e.g., Math, Biology).
* Each subject can contain multiple slide uploads (lectures).
* Notes, cheat sheets, and quizzes are organized within each subject/lecture.
* UI allows browsing, adding, renaming, and deleting subjects and lectures.
* All notes and generated documents are associated with their subject and lecture for easy retrieval.

**Key Constraints:**

* **Cost:** $0 (Free/Open Source only).
* **Hardware:** CPU-optimized (No GPU required).
* **Persistence:** Must remember uploaded slides after restart.
* **Privacy:** All processing happens locally (Ollama + Local DB).

---

## 2. Tech Stack Definition

* **Frontend:** `Streamlit` (Python web framework).
* **AI Engine (LLM):** `Ollama` running `llama3:8b-instruct-q4_0` (Quantized for CPU).
* **Vision & OCR:**
* `LayoutParser` + `Detectron2`: For detecting "Figure" vs "Text" regions.
* `Tesseract`: For OCR on text regions.
* `pdf2image` / `python-pptx`: For file conversion.


* **Memory (RAG):** `ChromaDB` (Persistent Vector Store).
* **Document Gen:** `python-docx` (Word), `fpdf` (PDF Quizzes).
* **External Knowledge:** `DuckDuckGo Search API` (Python).
* **User/Sharing:** `SQLite3` (Simple auth & link management).

---

## 3. System Architecture & Data Flow

### The Pipeline (Ingestion)

1. **Select Subject:** User selects or creates a Subject (e.g., "Physics").
2. **Upload:** User uploads `Lecture.pdf` to the selected Subject.
3. **Split:** System converts pages to high-res images (300 DPI).
4. **Route:**
* **Vision Track:** Detect diagrams  Crop  Save to `/assets/temp`.
* **Text Track:** OCR Text  Chunk  Embed  Save to `ChromaDB` (tagged by subject/lecture).



### The Brain (Interactive)

* **Chat:** User asks Question  Search `ChromaDB` (Top 3 chunks)  IF low confidence OR toggle enabled  Search Web (DuckDuckGo)  LLM Synthesizes answer.

### The Output (Generation)

* **Cheat Sheet:** Fetch summarized text + Insert relevant cropped diagrams  Format into 2-Column Word Doc, organized by subject and lecture.

---

## 4. File Structure

Tell the AI agent to create this specific folder structure (with subject/lecture organization):

```text
/app
 ├── /assets
 │    ├── /subjects           # Each subject has its own folder
 │    │    ├── <subject_name>/
 │    │    │    ├── uploaded_slides/    # Raw PDF/PPTX for this subject
 │    │    │    ├── cropped_figures/    # Diagrams for this subject
 │    │    │    └── notes/              # Generated notes, cheat sheets, quizzes for this subject
 │    └── (legacy: uploaded_slides, cropped_figures) # For backward compatibility if needed
 ├── /database
 │    ├── chroma_db/          # Vector embeddings (Persistent Memory, tagged by subject/lecture)
 │    └── users.db            # SQLite (Users, Passwords, Share Links, Subjects, Lectures)
 ├── /modules
 │    ├── ingestion.py        # PDF processing, OCR, LayoutParser logic, subject/lecture tagging
 │    ├── brain.py            # RAG logic, Ollama interface, Web Search, subject/lecture context
 │    ├── generator.py        # python-docx formatting & Quiz PDF creation, organized output
 │    └── auth.py             # Login, Share Link generation, Password hashing
 ├── app.py                   # Main Streamlit UI
 ├── subject_manager.py       # Subject and lecture CRUD logic
 └── requirements.txt         # Dependencies

```

---

## 5. Module Requirements (The "Instructions")

### Module A: Ingestion & Vision (`ingestion.py`)

* **Function:** `process_file(file_path)`
* **Logic:**
1. Convert PDF to images.
2. Run `LayoutParser` to find bounding boxes for `type="Figure"`.
3. **Critical:** Crop these figures and name them `slide_{x}_fig_{y}.png`.
4. Extract text from non-figure regions using Tesseract.
5. Clean text (remove "Slide 1/20", footers) and return as a list of strings.



### Module B: The Brain (`brain.py`)

* **Function:** `ask_question(query, use_web=False)`
* **Logic:**
1. Embed query using `OllamaEmbeddings`.
2. Retrieve top 3 context chunks from `ChromaDB`.
3. **Toggle Logic:**
* IF `use_web=True`: Run `DuckDuckGoSearchRun(query)`. Append result to context.


4. Prompt Llama3: *"Using this context, answer the user. If the answer is not in the context, state that clearly."*



### Module C: Document Generator (`generator.py`)

* **Function:** `create_cheat_sheet(summary_data)`
* **Style Rules (Strict):**
* **Page:** Narrow Margins (0.5 inch).
* **Columns:** 2 Columns.
* **Font:** Arial, Size 9 (Body), Size 11 Bold (Headers).
* **Spacing:** 0pt after paragraphs (Dense).
* **Diagrams:** Insert cropped images at `width=3.2 inches` to fit column.



### Module D: User Interface (`app.py`)


* **Sidebar:**
	* User Profile / Login.
	* **Subjects Panel:**
		* List all subjects.
		* Add, rename, delete subjects.
		* Select a subject to view its lectures/notes.
	* **Lectures Panel (within subject):**
		* List all lectures/slides for the selected subject.
		* Add, rename, delete lectures.
		* Select a lecture to view/process notes.
	* **Toggle:** "Web Search Mode" (On/Off).
	* **Action:** "Clear Memory" (Delete ChromaDB for selected subject/lecture).


* **Tabs:**
1. **Dashboard:** Select subject/lecture, upload files & "Process" button.
2. **Revision:** View generated notes for selected subject/lecture & "Download .docx".
3. **Tutor Chat:** Chat interface (context-aware: only uses notes from selected subject/lecture).
4. **Quiz Zone:** Button "Generate MCQ" for selected subject/lecture  Download PDF.
5. **Past Papers:** Upload Exam PDF (tagged to subject)  Output Answers.



---

## 6. Development Prompt for the AI Agent

---

## 7. Advanced Features Outline

### 7.1 Flashcards & Spaced Repetition
* Generate flashcards automatically from notes, quiz questions, or user input.
* Organize flashcards by subject and lecture.
* Integrate a spaced repetition algorithm (e.g., SM-2) to schedule reviews.
* Flashcard study mode with progress tracking and review reminders.
* Option to export/import flashcard decks (e.g., Anki format).

### 7.2 Note Linking & Mind Maps
* Allow users to create links between notes, concepts, or slides (bi-directional linking).
* Visualize relationships between notes as interactive mind maps.
* Clickable links in notes to jump between related content.
* Mind map view per subject or globally.

### 7.3 Customizable Note Templates
* Provide multiple note-taking templates (Cornell, Outline, Q&A, Blank, etc.).
* Allow users to design and save custom templates.
* Template selection when creating new notes or cheat sheets.
* Support for rich text, images, and diagrams in templates.

### 7.4 Progress Tracking & Analytics
* Dashboard showing study progress per subject and lecture.
* Track quiz/flashcard performance, time spent, and completion rates.
* Identify weak areas and suggest targeted revision.
* Visual analytics: charts for progress, heatmaps for activity, etc.

### 7.5 Mobile-Friendly & PWA
* Responsive UI for mobile, tablet, and desktop.
* Implement as a Progressive Web App (PWA) for offline access and installability.
* Push notifications for study reminders and spaced repetition.
* Touch-friendly controls for flashcards, mind maps, and note editing.

### 7.6 Import/Export & Backup
* Export notes, flashcards, and mind maps to PDF, Markdown, or Anki.
* Import notes or flashcards from common formats.
* One-click backup and restore of all user data (notes, settings, progress).
* Cloud sync option (optional, privacy-respecting/local-first by default).

**Copy and paste this into your AI coding tool to start building:**

> "Act as a Senior Python Developer. We are building a local RAG application called 'LectureToCheatSheet'.
> **Goal:** Take PDF lecture slides, extract text and diagrams, and generate a 2-column Word Document 'Cheat Sheet'. It also includes a Chatbot to query the slides.
> **Constraints:**
> 1. Use **Streamlit** for the UI.
> 2. Use **Ollama** (Llama 3) for the LLM and Embeddings.
> 3. Use **ChromaDB** with a `persist_directory` so data is saved between restarts.
> 4. **Vision Requirement:** Use `LayoutParser` or `OpenCV` to detect diagrams in slides, crop them, and save them as images. Do not describe them with text; keep the visual file.
> 5. **Sharing:** Use `SQLite` to generate shareable URLs with optional password protection.
> 
> 
> **Step 1:** Create the `requirements.txt` and the `app.py` skeleton with the Sidebar and Tabs layout.
> **Step 2:** Write the `ingestion.py` module that handles PDF upload, text extraction, and diagram cropping.
> **Step 3:** Implement the `generator.py` module using `python-docx` to format the text and insert the cropped diagrams into a 2-column layout.
> Please start by writing the file structure and the `requirements.txt`."