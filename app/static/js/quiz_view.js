// Quiz View Logic

let currentQuiz = null;
let currentQuestions = [];
let currentMode = 'showanswers';
let currentCardIndex = 0;
let isFlashcardRevealed = false;
let examTimerInterval = null;
let timeRemaining = 15 * 60; // Default
let examAnswers = {};
let practiceResults = {}; // {qId: is_correct}
let explainSettings = {
    scope: 'source',
    mode: 'normal',
    output: 'sentence',
    conversation_id: null
};

// Global for modal state
let modalQId = null;
let modalSettings = {
    scope: 'source',
    mode: 'elaborate',
    output: 'sentence'
};

/**
 * Load explain settings from localStorage (uses shared utility)
 */
function loadExplainSettingsFromStorage() {
    const settings = loadAiExplainSettings();
    explainSettings.scope = settings.scope;
    explainSettings.mode = settings.mode;
    explainSettings.output = settings.output;
}

/**
 * Save explain settings to localStorage (uses shared utility)
 */
function saveExplainSettingsToStorage() {
    saveAiExplainSettings({
        scope: explainSettings.scope,
        mode: explainSettings.mode,
        output: explainSettings.output
    });
}

/**
 * Convert inline enumerated lists to newline-separated Markdown lists.
 * Handles patterns like:
 *   "however: (1) item, (2) item, (3) item"
 *   "if: (a) item and (b) item"
 *   "a. Set value. b. Read clock. c. Clear memory."
 */
function convertInlineLists(text) {
    // Pattern 1: Numeric parens — "...: (1) text, (2) text, (3) text"
    // or "..., however: (1) text (2) text and (3) text"
    text = text.replace(
        /([^(]{5,}?[,:]\s*)\(1\)([\s\S]+?)(?=\n\n|\n[A-Z]|$)/g,
        (match, intro, rest) => {
            // Extract all (N) items from the rest
            const itemRegex = /\((\d+)\)\s*(.*?)(?=\s*\(\d+\)|$)/gs;
            const items = [];
            let m;
            // We need to get the first item text (after (1)) and all subsequent
            // The `rest` starts right after `(1)`, so prepend a fake (1) marker
            const restWithMarker = '(1)' + rest;
            const cleanedRest = restWithMarker
                .replace(/,?\s+and\s+\((\d+)\)/g, ' ($1)') // normalize "and (N)"
                .replace(/,\s+\((\d+)\)/g, ' ($1)'); // normalize ", (N)"

            const splitParts = cleanedRest.split(/\s*\((\d+)\)\s*/);
            // splitParts: ['', '1', 'item1 text', '2', 'item2 text', '3', 'item3 text']
            const lines = [];
            for (let i = 1; i < splitParts.length; i += 2) {
                const num = splitParts[i];
                const itemText = (splitParts[i + 1] || '').replace(/[,;]\s*$/, '').trim();
                if (itemText) lines.push(`${num}. ${itemText}`);
            }
            if (lines.length > 1) {
                return intro.replace(/\s+$/, '') + '\n' + lines.join('\n');
            }
            return match;
        }
    );

    // Pattern 2: Letter parens — "...: (a) text (b) text (c) text"
    text = text.replace(
        /([^(]{5,}?[,:]\s*)\(a\)([\s\S]+?)(?=\n\n|\n[A-Z]|$)/g,
        (match, intro, rest) => {
            const restWithMarker = '(a)' + rest;
            const splitParts = restWithMarker.split(/\s*\(([a-z])\)\s*/);
            const lines = [];
            for (let i = 1; i < splitParts.length; i += 2) {
                const letter = splitParts[i];
                const itemText = (splitParts[i + 1] || '').replace(/[,;]\s*$/, '').replace(/\s+and\s*$/, '').trim();
                if (itemText) lines.push(`- ${itemText}`);
            }
            if (lines.length > 1) {
                return intro.replace(/\s+$/, '') + '\n' + lines.join('\n');
            }
            return match;
        }
    );

    // Pattern 3: Single-line alphabetic list — "a. Item. b. Item. c. Item."
    // Only apply if we see two or more consecutive "letter. text." patterns on one line
    text = text.replace(
        /^([a-h])\.\s+(.+?)(?:\s+([b-i])\.\s+(.+?))+$/gm,
        (match) => {
            // Split the whole match by "letter. " boundaries
            const parts = match.split(/\s+(?=[a-h]\.\s)/);
            if (parts.length > 1) {
                return parts.map(p => `- ${p.replace(/^[a-h]\.\s+/, '')}`).join('\n');
            }
            return match;
        }
    );

    return text;
}

/**
 * Format quiz text supporting basic markdown and HTML tables.
 */
function formatQuizText(text) {
    if (!text) return "";

    // PRE-PROCESSING: Convert special formats before HTML escaping
    // 1. Convert bullet/special characters to markdown dashes
    let preformatted = text
        .replace(/•\s*/g, '- ')        // Bullet points
        .replace(/\u2022\s*/g, '- ')    // Unicode bullet
        .replace(/\u2013/g, '—')        // En dash to em dash
        .replace(/\u2019/g, "'")        // Smart quote
        .replace(/\u201c|\u201d/g, '"') // Smart double quotes
        .trim();

    // 2. Convert inline enumerated lists to proper newline-separated lists
    preformatted = convertInlineLists(preformatted);

    // 1. Escape basic HTML to prevent XSS (but allow our specific tags later)
    let formatted = preformatted
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // 2. Handle Bold & Italic
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // 3. Context-aware list renderer:
    //    - "-" / "*" → unordered list
    //    - "1." → ordered list; if last UL bullet ended with ":", nest inside it
    //    - "a." style items are NOT converted; they stay as plain text with their prefix
    const lines = formatted.split('\n');
    let html = '';
    let inUL = false;
    let inOL = false;
    let inNestedOL = false;   // nested <ol> inside last <li> of a <ul>
    let lastBulletText = '';  // track text of last bullet to detect colon endings

    function closeNestedOL() {
        if (inNestedOL) { html += '</ol></li>'; inNestedOL = false; }
    }
    function closeUL() {
        closeNestedOL();
        if (inUL) {
            // Close last li if it was never closed (it has no nested list)
            if (!inNestedOL) html += '</li>';
            html += '</ul>';
            inUL = false;
        }
        lastBulletText = '';
    }
    function closeOL() {
        if (inOL) { html += '</ol>'; inOL = false; }
    }

    lines.forEach(line => {
        const trimmed = line.trim();
        const isULItem = /^[-*]\s/.test(trimmed);
        // Only numeric ordered lists — preserve "a." style as-is
        const isOLItem = /^\d+\.\s/.test(trimmed);

        if (isULItem) {
            closeNestedOL();
            if (inOL) closeOL();
            // Open ul if needed; close previous li if already in ul
            if (!inUL) { html += '<ul class="quiz-rich-list">'; inUL = true; }
            else { html += '</li>'; }
            const content = trimmed.substring(2);  // strip "- " or "* "
            lastBulletText = content;
            html += `<li>${content}`;  // leave li open — might receive nested ol
        } else if (isOLItem) {
            const item = trimmed.replace(/^\d+\.\s/, '');
            const parentEndsColon = lastBulletText.trimEnd().endsWith(':');

            if (inUL && parentEndsColon) {
                // Nest inside the last open <li> of the ul
                if (!inNestedOL) {
                    html += '<ol class="quiz-rich-list-nested">';
                    inNestedOL = true;
                }
                html += `<li>${item}</li>`;
            } else {
                // Top-level ordered list
                closeNestedOL();
                if (inUL) { html += '</li>'; inUL = false; html += '</ul>'; lastBulletText = ''; }
                if (!inOL) { html += '<ol class="quiz-rich-list-ordered">'; inOL = true; }
                html += `<li>${item}</li>`;
                lastBulletText = '';
            }
        } else {
            // Regular text — close any open lists
            closeNestedOL();
            if (inUL) { html += '</li></ul>'; inUL = false; lastBulletText = ''; }
            if (inOL) { html += '</ol>'; inOL = false; }
            html += line + '\n';
        }
    });

    // Close anything still open
    closeNestedOL();
    if (inUL) { html += '</li></ul>'; }
    if (inOL) { html += '</ol>'; }

    formatted = html;

    // 4. Transform newlines to <br> (but only if not inside a table or list to keep it clean)
    // Actually, simple way is to replace \n with <br> then clean up list tags
    formatted = formatted.replace(/\n/g, '<br>');
    formatted = formatted.replace(/<\/li><br>/g, '</li>');
    formatted = formatted.replace(/<ul(.*?)><br>/g, '<ul$1>');
    formatted = formatted.replace(/<ol(.*?)><br>/g, '<ol$1>');
    formatted = formatted.replace(/<\/ul><br>/g, '</ul>');
    formatted = formatted.replace(/<\/ol><br>/g, '</ol>');

    // 5. Restore tables (if AI outputs them as &lt;table&gt; due to our escaping)
    formatted = formatted.replace(/&lt;table(.*?)&gt;/g, '<table$1 class="quiz-rich-table">');
    formatted = formatted.replace(/&lt;\/table&gt;/g, '</table>');
    formatted = formatted.replace(/&lt;thead(.*?)&gt;/g, '<thead$1>');
    formatted = formatted.replace(/&lt;\/thead&gt;/g, '</thead>');
    formatted = formatted.replace(/&lt;tbody(.*?)&gt;/g, '<tbody$1>');
    formatted = formatted.replace(/&lt;\/tbody&gt;/g, '</tbody>');
    formatted = formatted.replace(/&lt;tr(.*?)&gt;/g, '<tr$1>');
    formatted = formatted.replace(/&lt;\/tr&gt;/g, '</tr>');
    formatted = formatted.replace(/&lt;th(.*?)&gt;/g, '<th$1>');
    formatted = formatted.replace(/&lt;\/th&gt;/g, '</th>');
    formatted = formatted.replace(/&lt;td(.*?)&gt;/g, '<td$1>');
    formatted = formatted.replace(/&lt;\/td&gt;/g, '</td>');

    return formatted;
}

document.addEventListener('DOMContentLoaded', () => {
    // Load saved explain settings from localStorage
    loadExplainSettingsFromStorage();
    
    // URL format: /quiz/{id} or /quiz/{id}/{mode}
    const pathParts = window.location.pathname.split('/');
    const quizId = pathParts[2];
    const initialMode = pathParts[3] || null;

    if (!quizId) {
        window.location.href = '/quiz';
        return;
    }

    loadQuiz(quizId, initialMode);

    // Setup sidebar mode buttons
    document.querySelectorAll('#modeGrid .action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const mode = e.currentTarget.dataset.mode;
            setMode(mode);
        });
    });

    // Setup keyboard navigation for flashcards
    document.addEventListener('keydown', (event) => {
        if (currentMode !== 'flashcards') return;

        if (event.code === 'Space') {
            event.preventDefault();
            toggleFlashcardReveal();
        } else if (event.code === 'ArrowLeft') {
            event.preventDefault();
            prevCard();
        } else if (event.code === 'ArrowRight') {
            event.preventDefault();
            nextCard();
        }
    });
});

async function loadQuiz(quizId, initialMode) {
    try {
        const response = await fetch(`/quizzes/${quizId}`);
        if (!response.ok) throw new Error('Failed to load quiz');

        const data = await response.json();
        currentQuiz = data;
        currentQuestions = data.questions || [];

        // Update Header & Breadcrumbs
        document.getElementById('quizTitle').textContent = currentQuiz.title;
        document.getElementById('breadcrumbTitle').textContent = currentQuiz.title;

        // Update Info Grid
        document.getElementById('infoCount').textContent = currentQuestions.length;
        document.getElementById('infoScope').textContent = currentQuiz.scope_type.charAt(0).toUpperCase() + currentQuiz.scope_type.slice(1);
        const dateStr = window.formatDate(currentQuiz.created_at);
        document.getElementById('infoDate').textContent = dateStr;

        // AI Metadata
        document.getElementById('infoModel').textContent = currentQuiz.model || 'Manual';
        document.getElementById('infoProcessing').textContent = currentQuiz.processing_time_ms ? `${currentQuiz.processing_time_ms}ms` : '—';

        // Sync AI explain settings UI with loaded settings
        document.getElementById('explainScope').value = explainSettings.scope;
        document.getElementById('explainMode').value = explainSettings.mode;
        document.getElementById('explainOutput').value = explainSettings.output;

        if (initialMode) {
            setMode(initialMode, false);
        } else {
            // Show initial prompt
            document.getElementById('initialModeModal').classList.add('active');
            // Blur content
            document.getElementById('quizMainContent').style.filter = 'blur(8px)';
            document.getElementById('quizMainContent').style.pointerEvents = 'none';
        }

    } catch (error) {
        console.error('Error:', error);
        document.getElementById('quizContainer').innerHTML = `
            <div class="empty-state" style="color: var(--color-error);">
                <p>Error loading quiz. Please try again.</p>
            </div>
        `;
    }
}

function setMode(mode, updateUrl = true) {
    currentMode = mode;
    if (mode !== 'flashcards') {
        isFlashcardRevealed = false;
    }

    // UI state reset
    document.getElementById('quizMainContent').style.filter = 'none';
    document.getElementById('quizMainContent').style.pointerEvents = 'all';

    // Update breadcrumb with view mode
    const modeLabels = {
        'showanswers': 'Show Answers',
        'hideanswers': 'Hide Answers',
        'practice': 'Practice',
        'flashcards': 'Flashcards',
        'tableview': 'Table View',
        'examsimulator': 'Exam Simulator'
    };
    const modeLabel = modeLabels[mode] || 'View';
    document.getElementById('breadcrumbViewMode').textContent = modeLabel;
    document.getElementById('breadcrumbViewMode').style.display = 'inline';
    document.getElementById('breadcrumbViewSep').style.display = 'inline';

    // Update sidebar active state
    document.querySelectorAll('#modeGrid .action-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === mode);
    });

    // Clear exam state if exiting exam mode
    if (mode !== 'examsimulator') {
        clearInterval(examTimerInterval);
        document.getElementById('examStatsBar').style.display = 'none';
    }

    // Toggle displays
    document.getElementById('fcControls').style.display = (mode === 'flashcards') ? 'flex' : 'none';
    document.getElementById('practiceScore').style.display = (mode === 'practice') ? 'flex' : 'none';

    if (updateUrl) {
        history.pushState(null, '', `/quiz/${currentQuiz.id}/${mode}`);
    }

    // Special setup for exam mode
    if (mode === 'examsimulator') {
        openExamSetup();
        return; // Don't render yet, wait for setup
    }

    updateScore();
    renderQuestions();
}

function updateScore() {
    const total = currentQuestions.length;
    const correct = Object.values(practiceResults).filter(v => v === true).length;
    document.getElementById('scoreText').textContent = `${correct} / ${total}`;
}

function resetQuiz() {
    practiceResults = {};
    examAnswers = {};
    updateScore();
    renderQuestions();
}

function openExamSetup() {
    const recTime = Math.max(5, currentQuestions.length * 1.5);
    document.getElementById('recommendedTime').textContent = Math.ceil(recTime);
    document.getElementById('examTimeLimit').value = Math.ceil(recTime);
    document.getElementById('examSetupModal').classList.add('active');
}

function startExamSim() {
    const mins = parseInt(document.getElementById('examTimeLimit').value) || 15;
    timeRemaining = mins * 60;
    examAnswers = {};

    closeModal('examSetupModal');
    document.getElementById('examStatsBar').style.display = 'flex';

    updateTimerDisplay();
    examTimerInterval = setInterval(() => {
        timeRemaining--;
        updateTimerDisplay();
        if (timeRemaining <= 0) {
            clearInterval(examTimerInterval);
            submitExam();
        }
    }, 1000);

    renderQuestions();
}

function updateTimerDisplay() {
    const m = Math.floor(timeRemaining / 60);
    const s = timeRemaining % 60;
    const timerEl = document.getElementById('examTimer');
    if (timerEl) {
        timerEl.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
}

function filterQuestions() {
    renderQuestions();
}

function renderQuestions() {
    const container = document.getElementById('quizContainer');
    const query = document.getElementById('qSearchInput')?.value.toLowerCase() || '';
    const filter = document.getElementById('qSearchFilter')?.value || 'both';

    if (!currentQuestions || currentQuestions.length === 0) {
        isFlashcardRevealed = false;
        const counterEl = document.getElementById('fcCounter');
        if (counterEl) counterEl.textContent = '0 / 0';
        container.innerHTML = `
            <div class="empty-state" style="padding: 60px;">
                <i class="ph ph-file-dashed" style="font-size: 48px; color: var(--color-gray); margin-bottom: 16px;"></i>
                <h3>No Questions Yet</h3>
                <p style="color: var(--color-gray);">This quiz is currently empty.</p>
                <button class="btn btn-primary" style="margin-top: 20px;" onclick="openAddQuestionModal()">
                    <i class="ph ph-plus"></i> Add First Question
                </button>
            </div>
        `;
        return;
    }

    // Filter questions based on search query and filter type
    const filteredQuestions = currentQuestions.filter(q => {
        if (!query) return true;

        const textMatch = q.question_text.toLowerCase().includes(query);
        const answerMatch = q.answer_text.toLowerCase().includes(query);

        let optionsMatch = false;
        if (q.options) {
            try {
                const opts = typeof q.options === 'string' ? JSON.parse(q.options) : q.options;
                optionsMatch = opts.some(opt => opt.toLowerCase().includes(query));
            } catch (e) { }
        }

        if (filter === 'question') return textMatch || optionsMatch;
        if (filter === 'answer') return answerMatch;
        return textMatch || answerMatch || optionsMatch;
    });

    // Hide search in modes where it doesn't make sense (flashcards, exam)
    const searchSection = document.getElementById('quizSearchSection');
    if (searchSection) {
        searchSection.style.display = (currentMode === 'flashcards' || currentMode === 'examsimulator') ? 'none' : 'flex';
    }

    if (filteredQuestions.length === 0 && query) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 60px;">
                <i class="ph ph-magnifying-glass" style="font-size: 48px; color: var(--color-gray); margin-bottom: 16px;"></i>
                <h3>No matches found</h3>
                <p style="color: var(--color-gray);">Try a different search term.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '';

    if (currentMode === 'tableview') {
        renderTableMode(container, filteredQuestions);
    } else if (currentMode === 'flashcards') {
        renderFlashcardMode(container); // Search disabled for flashcards
    } else {
        filteredQuestions.forEach((q, index) => {
            // Find actual index from currentQuestions for "Question X" label
            const actualIndex = currentQuestions.indexOf(q);
            container.appendChild(createQuestionCard(q, actualIndex));
        });
    }
}

function renderTableMode(container, questions) {
    const tableWrap = document.createElement('div');
    tableWrap.className = 'quiz-table-container';

    tableWrap.innerHTML = `
        <table class="quiz-table">
            <thead>
                <tr>
                    <th width="60">#</th>
                    <th width="120">Type</th>
                    <th>Question</th>
                    <th>Correct Answer</th>
                </tr>
            </thead>
            <tbody>
                ${questions.map((q) => {
        const actualIndex = currentQuestions.indexOf(q);
        return `
                        <tr>
                            <td style="font-weight: 700; color: var(--color-primary);">${actualIndex + 1}</td>
                            <td><span class="q-type-badge">${q.question_type.replace(/_/g, ' ')}</span></td>
                            <td style="font-weight: 500;">${formatQuizText(q.question_text)}</td>
                            <td style="color: var(--color-success);">${formatQuizText(q.answer_text)}</td>
                        </tr>
                    `;
    }).join('')}
            </tbody>
        </table>
    `;
    container.appendChild(tableWrap);
}

function renderFlashcardMode(container) {
    if (currentCardIndex >= currentQuestions.length) {
        currentCardIndex = 0;
        isFlashcardRevealed = false;
    }
    if (currentCardIndex < 0) {
        currentCardIndex = currentQuestions.length - 1;
        isFlashcardRevealed = false;
    }

    const q = currentQuestions[currentCardIndex];
    const counterEl = document.getElementById('fcCounter');
    if (counterEl) {
        counterEl.textContent = `${currentCardIndex + 1} / ${currentQuestions.length}`;
    }

    const fcContainer = document.createElement('div');
    fcContainer.className = 'flashcard-container';

    const card = document.createElement('div');
    card.className = 'flashcard';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-pressed', String(isFlashcardRevealed));
    card.classList.toggle('show-answer', isFlashcardRevealed);

    card.addEventListener('click', () => {
        toggleFlashcardReveal();
    });
    card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleFlashcardReveal();
        }
    });

    card.innerHTML = `
        <div class="flashcard-face flashcard-question">
            <span class="q-type-badge flashcard-label">
                ${q.original_number ? `<span class="q-orig-num">${q.original_number}</span> ` : ''}Question ${currentCardIndex + 1}
            </span>
            <div class="fc-content fc-question-text">${formatQuizText(q.question_text)}</div>
            <p class="flashcard-instruction">
                <i class="ph ph-hand-pointing"></i>
                Click to reveal, or press <kbd>Space</kbd> | <kbd>←</kbd> <kbd>→</kbd> on keyboard
            </p>
        </div>
        <div class="flashcard-face flashcard-answer">
            <span class="q-type-badge flashcard-label flashcard-answer-label">Answer</span>
            <div class="fc-content fc-answer-text">${formatQuizText(q.answer_text)}</div>
            <p class="flashcard-instruction">
                <i class="ph ph-hand-pointing"></i>
                Click to reveal question, or press <kbd>Space</kbd> to flip
            </p>
        </div>
    `;

    fcContainer.appendChild(card);
    container.appendChild(fcContainer);

    // Adjust font size to ensure content fits without scrolling
    // Use requestAnimationFrame to ensure the card is rendered and dimensions are available
    requestAnimationFrame(() => {
        adjustFlashcardFontSize(card);
    });
}

/**
 * Dynamically shrinks font size of flashcard content if it overflows the card area.
 * @param {HTMLElement} cardElement The .flashcard element
 */
function adjustFlashcardFontSize(cardElement) {
    const faces = cardElement.querySelectorAll('.flashcard-face');
    faces.forEach(face => {
        const content = face.querySelector('.fc-content');
        if (!content) return;

        // Detect if content contains a list and apply left-alignment if so
        const hasList = content.querySelector('ul, ol') !== null;
        face.classList.toggle('has-list', hasList);

        // Reset to base font size defined in CSS
        const isQuestion = face.classList.contains('flashcard-question');
        let fontSize = isQuestion ? 1.6 : 1.5; // rem
        content.style.fontSize = fontSize + 'rem';

        const label = face.querySelector('.flashcard-label');
        const instruction = face.querySelector('.flashcard-instruction');

        // Gradually shrink font size until everything fits within the card height
        let iterations = 0;
        const minFontSize = 0.5; // rem

        // Function to calculate if total layout fits precisely in face (handles vertical centering)
        const checkFits = () => {
            const faceRect = face.getBoundingClientRect();
            const labelRect = label ? label.getBoundingClientRect() : null;
            const instrRect = instruction ? instruction.getBoundingClientRect() : null;

            // 1. Check if the top label is being pushed off the top (occurs during vertical centering overflow)
            if (labelRect && labelRect.top < faceRect.top + 12) {
                return false;
            }

            // 2. Check if the instruction (footer) is being pushed out of the bottom
            if (instrRect && instrRect.bottom > faceRect.bottom - 12) {
                return false;
            }

            // 3. Double check if the content itself is overflowing its own container
            if (content.scrollHeight > content.clientHeight + 2) {
                return false;
            }

            return true;
        };

        // Reset scale loop
        while (!checkFits() && fontSize > minFontSize && iterations < 35) {
            fontSize -= 0.04;
            content.style.fontSize = fontSize.toFixed(2) + 'rem';
            iterations++;
        }
    });
}

function toggleFlashcardReveal(forceState = null) {
    if (!currentQuestions.length) return;
    if (typeof forceState === 'boolean') {
        isFlashcardRevealed = forceState;
    } else {
        isFlashcardRevealed = !isFlashcardRevealed;
    }
    renderQuestions();
}

function prevCard() {
    currentCardIndex--;
    isFlashcardRevealed = false;
    renderQuestions();
}

function nextCard() {
    currentCardIndex++;
    isFlashcardRevealed = false;
    renderQuestions();
}

function createQuestionCard(q, index) {
    const card = document.createElement('div');
    card.className = 'q-card';
    card.id = `q-${q.id}`;

    const header = document.createElement('div');
    header.className = 'q-header';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = 'var(--spacing-md)';
    header.style.paddingBottom = 'var(--spacing-sm)';
    header.style.borderBottom = '1px solid var(--color-bg)';

    header.innerHTML = `
        <div style="display: flex; align-items: center; gap: var(--spacing-md);">
            <div class="q-number">
                ${q.original_number ? `<span class="q-orig-num">${q.original_number}</span> ` : ''}Question ${index + 1}
            </div>
            <div class="q-type-badge">${q.question_type.replace(/_/g, ' ')}</div>
        </div>
        <div class="quiz-actions-menu">
            <button class="btn btn-outline btn-small" onclick="event.stopPropagation(); toggleQuestionActionMenu(event, '${q.id}')" title="Actions">
                <i class="ph ph-dots-three-vertical"></i>
            </button>
            <div id="q-menu-${q.id}" class="quiz-dropdown-menu">
                <button onclick="event.stopPropagation(); openEditQuestionModal('${q.id}')">
                    <i class="ph ph-pencil-simple"></i> Edit Question
                </button>
                <button onclick="event.stopPropagation(); deleteQuestion('${q.id}')" style="color: var(--color-error);">
                    <i class="ph ph-trash"></i> Delete
                </button>
            </div>
        </div>
    `;
    card.appendChild(header);

    const text = document.createElement('div');
    text.className = 'q-text';
    text.innerHTML = formatQuizText(q.question_text);
    card.appendChild(text);

    // Practice & Exam mode inputs
    if (currentMode === 'practice' || currentMode === 'examsimulator') {
        if (q.question_type === 'objective' && q.options) {
            const optsContainer = document.createElement('div');
            optsContainer.className = 'q-options';
            let options = [];
            try { options = typeof q.options === 'string' ? JSON.parse(q.options) : q.options; } catch (e) { }

            options.forEach((opt, optIdx) => {
                const optEl = document.createElement('div');
                optEl.className = 'q-option';

                // Restore state
                if (currentMode === 'examsimulator' && examAnswers[q.id] === opt) optEl.classList.add('selected');
                if (currentMode === 'practice' && practiceResults[q.id] !== undefined) {
                    if (opt.trim() === q.answer_text.trim()) optEl.classList.add('correct');
                    else if (examAnswers[q.id] === opt) optEl.classList.add('incorrect');
                }

                optEl.innerHTML = `<span style="opacity: 0.5; font-weight: 700;">${String.fromCharCode(65 + optIdx)}</span> <span>${formatQuizText(opt)}</span>`;
                optEl.onclick = () => {
                    if (currentMode === 'practice' && practiceResults[q.id] !== undefined) return;
                    selectOption(q.id, optEl, opt);
                };

                optsContainer.appendChild(optEl);
            });
            card.appendChild(optsContainer);
        } else {
            const input = document.createElement('textarea');
            input.className = 'form-control';
            input.placeholder = "Type your answer here...";
            input.rows = 3;
            input.oninput = (e) => { examAnswers[q.id] = e.target.value; };
            if (examAnswers[q.id]) input.value = examAnswers[q.id];

            if (currentMode === 'practice' && practiceResults[q.id] !== undefined) {
                input.disabled = true;
            }
            card.appendChild(input);
        }

        if (currentMode === 'practice') {
            const checkBtn = document.createElement('button');
            checkBtn.className = 'btn btn-primary';
            checkBtn.style.marginTop = '20px';
            checkBtn.innerHTML = '<i class="ph ph-check-circle"></i> Check Answer';
            checkBtn.onclick = () => submitAnswerForCheck(q.id, card);

            if (practiceResults[q.id] !== undefined) {
                checkBtn.style.display = 'none';
            }
            card.appendChild(checkBtn);

            const feedback = document.createElement('div');
            feedback.className = 'feedback-box';
            feedback.id = `fb-${q.id}`;
            if (practiceResults[q.id] !== undefined) {
                feedback.style.display = 'block';
                feedback.innerHTML = `<div style="font-weight:700;">Question Answered</div><div style="margin-top:8px;">Correct Answer: ${q.answer_text}</div>`;
            }
            card.appendChild(feedback);
        }
    }
    // Standard / Hidden modes
    else {
        const answerBox = document.createElement('div');
        answerBox.className = 'q-answer-box';

        const answerHeader = document.createElement('div');
        answerHeader.className = 'q-answer-header';
        
        const label = document.createElement('span');
        label.className = 'q-answer-label';
        label.textContent = 'Correct Answer';
        answerHeader.appendChild(label);

        const explainBtn = document.createElement('button');
        explainBtn.className = 'explain-btn-inline';
        explainBtn.id = `btn-explain-${q.id}`;
        explainBtn.innerHTML = '<i class="ph ph-sparkle"></i> Explain';
        explainBtn.onclick = () => explainQuestion(q.id);
        answerHeader.appendChild(explainBtn);

        answerBox.appendChild(answerHeader);

        const answerContent = document.createElement('div');
        answerContent.innerHTML = formatQuizText(q.answer_text);

        if (currentMode === 'hideanswers') {
            answerContent.className = 'hidden-content';
            answerContent.onclick = () => answerContent.classList.toggle('revealed');
            answerContent.title = "Click to reveal answer";
        }

        answerBox.appendChild(answerContent);
        card.appendChild(answerBox);
    }

    // Explanation Box
    const explanationBox = document.createElement('div');
    explanationBox.className = 'q-explanation-box';
    explanationBox.id = `explanation-${q.id}`;
    card.appendChild(explanationBox);

    return card;
}

function selectOption(qId, el, value) {
    const container = el.parentElement;
    container.querySelectorAll('.q-option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    examAnswers[qId] = value;
}

async function submitAnswerForCheck(qId, cardEl) {
    const q = currentQuestions.find(x => x.id === qId);
    let userAns = examAnswers[qId] || '';

    if (q.question_type !== 'objective') {
        const input = cardEl.querySelector('.form-control');
        if (input) userAns = input.value;
    }

    if (!userAns) {
        showErrorModal('Answer Required', 'Please provide an answer first.');
        return;
    }

    const checkBtn = cardEl.querySelector('.btn-primary');
    const originalText = checkBtn.innerHTML;
    checkBtn.innerHTML = '<i class="ph ph-spinner-gap ph-spin"></i> Checking...';
    checkBtn.disabled = true;

    try {
        const response = await fetch(`/quizzes/${currentQuiz.id}/check?question_id=${qId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_answer: userAns })
        });

        const result = await response.json();
        practiceResults[qId] = result.is_correct;
        updateScore();

        const fbEl = document.getElementById(`fb-${qId}`);
        fbEl.className = 'feedback-box ' + (result.is_correct ? 'correct' : 'incorrect');
        fbEl.style.display = 'block';
        fbEl.innerHTML = `
            <div style="font-weight:700; margin-bottom:8px; display: flex; align-items: center; gap: 6px;">
                ${result.is_correct ? '<i class="ph-fill ph-check-circle" style="font-size: 1.2rem;"></i> Correct' : '<i class="ph-fill ph-x-circle" style="font-size: 1.2rem;"></i> Incorrect'}
            </div>
            <div style="line-height: 1.5; font-size: 14px; margin-bottom: 10px;">${result.feedback}</div>
            <div style="padding-top: 10px; border-top: 1px solid rgba(0,0,0,0.05); font-size: 13px; color: var(--color-dark);">
                <span style="font-weight: 700; opacity: 0.7; text-transform: uppercase; font-size: 10px; display: block; margin-bottom: 2px;">Expected Answer:</span>
                ${result.correct_answer}
            </div>
        `;

        checkBtn.style.display = 'none';

        if (q.question_type === 'objective') {
            const opts = cardEl.querySelectorAll('.q-option');
            opts.forEach(opt => {
                const optText = opt.querySelector('span:last-child').textContent.trim();
                if (optText === result.correct_answer.trim()) {
                    opt.classList.add('correct');
                } else if (opt.classList.contains('selected') && !result.is_correct) {
                    opt.classList.add('incorrect');
                }
            });
        } else {
            cardEl.querySelector('.form-control').disabled = true;
        }

    } catch (error) {
        console.error("Check failed", error);
        showErrorModal('Grading Failed', 'Failed to grade your answer. Please try again.');
        checkBtn.innerHTML = originalText;
        checkBtn.disabled = false;
    }
}

async function submitExam() {
    clearInterval(examTimerInterval);
    showSuccessModal('Exam Finished', 'Exam Simulator Finished! Review your answers in the standard or practice modes.');
    setMode('showanswers');
}

function exportQuiz() {
    document.getElementById('exportModal').classList.add('active');
}

async function doExport(format) {
    const btn = event.currentTarget;
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<i class="ph ph-spinner-gap ph-spin"></i> Exporting...';
    btn.disabled = true;

    try {
        const res = await fetch(`/quizzes/${currentQuiz.id}/export`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ format: format })
        });

        if (!res.ok) throw new Error('Export failed');
        const data = await res.json();
        window.location.href = data.download_url;
        closeModal('exportModal');
    } catch (e) {
        showErrorModal('Export Failed', e.message);
    } finally {
        btn.innerHTML = originalContent;
        btn.disabled = false;
    }
}

// Modal
function openAddQuestionModal() {
    setAddMethod('ai');
    document.getElementById('newQText').value = '';
    document.getElementById('newQAnswer').value = '';
    document.getElementById('newQOptionsText').value = '';
    document.getElementById('addQuestionModal').classList.add('active');
    toggleOptionInputs();
}

function setAddMethod(method) {
    document.getElementById('addMethodInput').value = method;
    document.getElementById('btnAddMethodAi').classList.toggle('active', method === 'ai');
    document.getElementById('btnAddMethodManual').classList.toggle('active', method === 'manual');
    document.getElementById('addAiSection').style.display = method === 'ai' ? 'block' : 'none';
    document.getElementById('addManualSection').style.display = method === 'manual' ? 'block' : 'none';
}

async function generateQuestionAi() {
    const qType = document.getElementById('aiQType').value;
    const btn = document.getElementById('btnGenerateQ');
    const originalText = btn.innerHTML;

    btn.innerHTML = '<i class="ph ph-spinner-gap ph-spin"></i> Generating...';
    btn.disabled = true;

    try {
        const response = await fetch(`/quizzes/${currentQuiz.id}/generate_single`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question_type: qType })
        });

        if (!response.ok) throw new Error('Failed to generate question');

        const newQ = await response.json();
        currentQuestions.push(newQ);
        closeModal('addQuestionModal');

        // Refresh UI
        document.getElementById('infoCount').textContent = currentQuestions.length;
        renderQuestions();

    } catch (e) {
        alert("Generation failed: " + e.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function toggleOptionInputs() {
    const type = document.getElementById('newQType').value;
    document.getElementById('newQOptions').style.display = type === 'objective' ? 'block' : 'none';
}

async function addQuestion() {
    const qtype = document.getElementById('newQType').value;
    const text = document.getElementById('newQText').value.trim();
    const answer = document.getElementById('newQAnswer').value.trim();

    if (!text || !answer) {
        alert("Question and Answer are required.");
        return;
    }

    let optionsList = null;
    if (qtype === 'objective') {
        const optsRaw = document.getElementById('newQOptionsText').value.trim();
        if (!optsRaw) {
            alert("Please provide options for multiple choice.");
            return;
        }
        optionsList = optsRaw.split('\n').map(s => s.trim()).filter(s => s.length > 0);
    }

    try {
        const response = await fetch(`/quizzes/${currentQuiz.id}/questions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                question_text: text,
                answer_text: answer,
                question_type: qtype,
                options: optionsList,
                order: currentQuestions.length
            })
        });

        if (!response.ok) throw new Error('Failed to add question');

        const newQ = await response.json();
        currentQuestions.push(newQ);
        closeModal('addQuestionModal');

        document.getElementById('infoCount').textContent = currentQuestions.length;
        renderQuestions();

    } catch (e) {
        alert(e.message);
    }
}

function toggleQuestionActionMenu(event, qId) {
    // Close all other menus
    document.querySelectorAll('.quiz-dropdown-menu').forEach(menu => {
        if (menu.id !== `q-menu-${qId}`) {
            menu.classList.remove('active');
        }
    });

    const menu = document.getElementById(`q-menu-${qId}`);
    menu.classList.toggle('active');

    // Close on click outside
    const closeMenu = (e) => {
        if (!menu.contains(e.target) && !event.target.contains(e.target)) {
            menu.classList.remove('active');
            document.removeEventListener('click', closeMenu);
        }
    };
    document.addEventListener('click', closeMenu);
}

function deleteQuestion(qId) {
    showConfirmModal('Are you sure you want to delete this question?', async () => {
        try {
            const response = await fetch(`/quizzes/${currentQuiz.id}/questions/${qId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                currentQuestions = currentQuestions.filter(q => q.id !== qId);
                renderQuestions();
                document.getElementById('infoCount').textContent = currentQuestions.length;
                showSuccessModal('Question Deleted', 'The question has been removed from the quiz.');
            } else {
                showErrorModal('Delete Failed', 'Failed to delete the question.');
            }
        } catch (e) {
            console.error(e);
            showErrorModal('Error', 'An unexpected error occurred.');
        }
    });
}

function openEditQuestionModal(qId) {
    const q = currentQuestions.find(x => x.id === qId);
    if (!q) return;

    setAddMethod('manual');
    document.querySelector('.method-toggle').style.display = 'none';

    document.getElementById('newQType').value = q.question_type;
    document.getElementById('newQText').value = q.question_text;
    document.getElementById('newQAnswer').value = q.answer_text;

    if (q.question_type === 'objective' && q.options) {
        let opts = typeof q.options === 'string' ? JSON.parse(q.options) : q.options;
        document.getElementById('newQOptionsText').value = opts.join('\n');
    }

    toggleOptionInputs();

    document.getElementById('addQuestionModal').classList.add('active');

    const submitBtn = document.querySelector('#addManualSection .btn-primary');
    submitBtn.textContent = 'Save Changes';
    submitBtn.onclick = (e) => {
        e.preventDefault();
        submitEditQuestion(qId);
    };
}

async function submitEditQuestion(qId) {
    const qtype = document.getElementById('newQType').value;
    const text = document.getElementById('newQText').value.trim();
    const answer = document.getElementById('newQAnswer').value.trim();

    if (!text || !answer) {
        showErrorModal('Required Fields', "Question and Answer are required.");
        return;
    }

    let optionsList = null;
    if (qtype === 'objective') {
        const optsRaw = document.getElementById('newQOptionsText').value.trim();
        if (!optsRaw) {
            showErrorModal('Required Fields', "Please provide options for multiple choice.");
            return;
        }
        optionsList = optsRaw.split('\n').map(s => s.trim()).filter(s => s.length > 0);
    }

    try {
        const response = await fetch(`/quizzes/${currentQuiz.id}/questions/${qId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                question_text: text,
                answer_text: answer,
                question_type: qtype,
                options: optionsList
            })
        });

        if (!response.ok) throw new Error('Failed to update question');

        const updatedQ = await response.json();
        const idx = currentQuestions.findIndex(x => x.id === qId);
        currentQuestions[idx] = updatedQ;

        closeModal('addQuestionModal');
        renderQuestions();
        showSuccessModal('Question Updated', 'Changes saved successfully.');

        // Reset modal for next use
        document.querySelector('.method-toggle').style.display = 'flex';
        const addBtn = document.querySelector('#addManualSection .btn-primary');
        addBtn.textContent = 'Add Question';
        addBtn.onclick = addQuestion;

    } catch (e) {
        showErrorModal('Update Failed', e.message);
    }
}

async function explainQuestion(qId, forceRegenerate = false) {
    const btn = document.getElementById(`btn-explain-${qId}`);
    const box = document.getElementById(`explanation-${qId}`);
    const q = currentQuestions.find(q => q.id == qId);

    // 1. Check if cached version exists and MATCHES current requested parameters
    const matchesSettings = q.explanation && 
                           q.explanation_mode === explainSettings.mode && 
                           q.explanation_output === explainSettings.output;

    if (q.explanation && matchesSettings && !forceRegenerate && !box.classList.contains('active')) {
        renderExplanationBox(q, box);
        box.classList.add('active');
        box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        if (btn) btn.innerHTML = '<i class="ph ph-sparkle"></i> Re-explain';
        return;
    }

    // 2. Otherwise, proceed with API call
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="ph ph-spinner-gap ph-spin"></i> Explaining...';
    }

    // Show loading bar
    box.classList.add('active');
    box.innerHTML = `
        <div class="progress-container margin-top-sm">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-md);">
                <span style="font-weight: 600; font-size: var(--font-size-sm);">Generating Explanation...</span>
                <span id="explainProgressPercent-${qId}" style="font-size: var(--font-size-sm); color: var(--color-gray);">0%</span>
            </div>
            <div class="progress-bar">
                <div id="explainProgressFill-${qId}" class="progress-fill" style="width: 0%; transition: width 0.5s ease;"></div>
            </div>
            <p id="explainProgressMessage-${qId}" style="font-size: var(--font-size-xs); color: var(--color-gray); margin: 0;">Analyzing question context...</p>
        </div>
    `;
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress > 90) progress = 90;
        const pFill = document.getElementById(`explainProgressFill-${qId}`);
        const pPercent = document.getElementById(`explainProgressPercent-${qId}`);
        const pMsg = document.getElementById(`explainProgressMessage-${qId}`);
        if (pFill) pFill.style.width = `${Math.round(progress)}%`;
        if (pPercent) pPercent.innerText = `${Math.round(progress)}%`;
        if (pMsg && progress > 50) pMsg.innerText = "Synthesizing AI response...";
    }, 800);

    try {
        const payload = {
            scope: explainSettings.scope,
            ai_mode: explainSettings.mode,
            output_format: explainSettings.output
        };

        // Add user answer context for personalized feedback if available
        if ((currentMode === 'practice' || currentMode === 'examsimulator') && examAnswers[qId]) {
            payload.user_answer = examAnswers[qId];
        }

        const response = await fetch(`/quizzes/${currentQuiz.id}/questions/${qId}/explain`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error('Explanation failed');

        const updatedQ = await response.json();
        
        // Update local state
        const idx = currentQuestions.findIndex(x => x.id == qId);
        if (idx !== -1) currentQuestions[idx] = updatedQ;

        renderExplanationBox(updatedQ, box);
        box.classList.add('active');
        box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    } catch (error) {
        console.error('Error:', error);
        alert('Could not generate explanation: ' + error.message);
        closeExplanation(qId);
    } finally {
        clearInterval(progressInterval);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="ph ph-sparkle"></i> Re-explain';
        }
    }
}

/**
 * Helper to render the internal content and buttons of the explanation box.
 */
function renderExplanationBox(q, box) {
    const modeIcons = {
        'normal': 'ph ph-stack',
        'quick': 'ph ph-lightning',
        'simple': 'ph ph-text-a-underline',
        'elaborate': 'ph ph-lightbulb',
        'eli5': 'ph ph-smiley'
    };
    const formatIcons = {
        'sentence': 'ph ph-text-t',
        'pointform': 'ph ph-list-bullets',
        'numbered_list': 'ph ph-list-numbers',
        'table': 'ph ph-table'
    };

    const modeIcon = modeIcons[q.explanation_mode] || 'ph ph-sparkle';
    const formatIcon = formatIcons[q.explanation_output] || 'ph ph-text-t';

    box.innerHTML = `
        <div class="q-explanation-header" style="display: flex; justify-content: space-between; align-items: center;">
            <span class="q-explanation-title">AI Explanation</span>
            <button class="btn-icon" onclick="closeExplanation(${q.id})" title="Close Explanation">
                <i class="ph ph-x"></i>
            </button>
        </div>
        <div class="q-explanation-content">${formatQuizText(q.explanation)}</div>
        <div class="q-explanation-footer">
            <div class="ai-meta-badges">
                <span class="ai-mode-badge" onclick="showExplainOptions(${q.id})" title="AI Mode used" style="text-transform: capitalize;">
                    <i class="${modeIcon}"></i> ${q.explanation_mode}
                </span>
                <span class="ai-mode-badge" onclick="showExplainOptions(${q.id})" title="Response style" style="text-transform: capitalize;">
                    <i class="${formatIcon}"></i> ${q.explanation_output.replace('_', ' ')}
                </span>
            </div>
            <div class="explanation-actions">
                <button class="btn-explanation-action" onclick="openChatDrawer(${q.id})">
                    <i class="ph ph-chat-circle-dots"></i> Follow-up
                </button>
                <button class="btn-explanation-action danger-lite" onclick="explainQuestion(${q.id}, true)">
                    <i class="ph ph-arrows-counter-clockwise"></i> Re-explain
                </button>
            </div>
        </div>
    `;
}

function closeExplanation(qId) {
    const box = document.getElementById(`explanation-${qId}`);
    const btn = document.getElementById(`btn-explain-${qId}`);
    if (box) box.classList.remove('active');
    if (btn) btn.innerHTML = '<i class="ph ph-sparkle"></i> Explain';
}

// Follow-up Chat Logic
let currentChatQuestionId = null;

function openChatDrawer(qId) {
    currentChatQuestionId = qId;
    const q = currentQuestions.find(q => q.id == qId);

    document.getElementById('drawerOverlay').classList.add('active');
    document.getElementById('chatDrawer').classList.add('active');

    // Clear previous messages if it's a new context (optional)
    const container = document.getElementById('chatDrawerMessages');
    container.innerHTML = `
        <div class="chat-mention">
            Referencing Question: "${q.question_text.substring(0, 50)}${q.question_text.length > 50 ? '...' : ''}"
        </div>
        <div class="chat-message-bubble ai">
            I've loaded the context for this question. What else would you like to know about it?
        </div>
    `;

    // Reset conversation ID for fresh start on each question unless you want continuity
    explainSettings.conversation_id = 'quiz-' + qId + '-' + Date.now();

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
}

function closeChatDrawer() {
    document.getElementById('drawerOverlay').classList.remove('active');
    document.getElementById('chatDrawer').classList.remove('active');
    currentChatQuestionId = null;
}

async function sendFollowUp() {
    const input = document.getElementById('chatDrawerInput');
    const text = input.value.trim();
    if (!text) return;

    const container = document.getElementById('chatDrawerMessages');

    // User message
    const userMsg = document.createElement('div');
    userMsg.className = 'chat-message-bubble user';
    userMsg.textContent = text;
    container.appendChild(userMsg);

    input.value = '';
    container.scrollTop = container.scrollHeight;

    // Loading indicator
    const loadingMsgId = 'loading-' + Date.now();
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'chat-message-bubble ai';
    loadingMsg.id = loadingMsgId;
    loadingMsg.innerHTML = '<i class="ph ph-spinner-gap ph-spin"></i> AI is thinking...';
    container.appendChild(loadingMsg);
    container.scrollTop = container.scrollHeight;

    try {
        const q = currentQuestions.find(q => q.id == currentChatQuestionId);

        // We reuse the main chat endpoint but with the quiz context
        const response = await fetch('/chat/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lecture_id: currentQuiz.lecture_id,
                subject_id: currentQuiz.subject_id,
                group_id: currentQuiz.group_id,
                message: `[Context: Q: ${q.question_text} | A: ${q.answer_text}] Follow-up: ${text}`,
                ai_mode: explainSettings.mode,
                output_format: explainSettings.output,
                conversation_id: explainSettings.conversation_id,
                auto_detect_conversation: false
            })
        });

        if (!response.ok) throw new Error('Chat failed');
        const data = await response.json();

        const finalMsg = document.getElementById(loadingMsgId);
        finalMsg.innerHTML = formatQuizText(data.response);
        container.scrollTop = container.scrollHeight;

    } catch (error) {
        console.error('Error:', error);
        const finalMsg = document.getElementById(loadingMsgId);
        finalMsg.textContent = 'Sorry, I encountered an error answering that.';
    }
}

// Bulk Edit Mode Logic
function enterEditMode() {
    renderEditTable();
    document.getElementById('editModeModal').classList.add('active');
}

function renderEditTable() {
    const tbody = document.getElementById('editTableBody');
    tbody.innerHTML = '';

    [...currentQuestions].sort((a, b) => (a.order || 0) - (b.order || 0)).forEach((q, idx) => {
        const row = document.createElement('tr');
        row.dataset.id = q.id;
        row.innerHTML = `
            <td class="drag-handle"><i class="ph ph-dots-six-vertical"></i></td>
            <td style="color: var(--color-gray); font-size: 11px;">${q.id}</td>
            <td><textarea class="form-control q-edit-text" rows="2">${q.question_text}</textarea></td>
            <td><textarea class="form-control q-edit-answer" rows="2">${q.answer_text}</textarea></td>
            <td>
                <select class="options-select q-edit-type" style="font-size: 12px; height: 32px;">
                    <option value="subjective" ${q.question_type == 'subjective' ? 'selected' : ''}>Subjective</option>
                    <option value="objective" ${q.question_type == 'objective' ? 'selected' : ''}>Objective</option>
                    <option value="fill_in_the_blank" ${q.question_type == 'fill_in_the_blank' ? 'selected' : ''}>Fill-blank</option>
                </select>
            </td>
            <td>
                <div class="flex-align-center gap-sm">
                    <button class="btn-icon" onclick="moveRow(this, -1)" title="Move Up"><i class="ph ph-caret-up"></i></button>
                    <button class="btn-icon" onclick="moveRow(this, 1)" title="Move Down"><i class="ph ph-caret-down"></i></button>
                    <button class="btn-icon" onclick="deleteRow(this)" style="color: var(--color-error);"><i class="ph ph-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function moveRow(btn, direction) {
    const row = btn.closest('tr');
    const parent = row.parentElement;
    if (direction === -1 && row.previousElementSibling) {
        parent.insertBefore(row, row.previousElementSibling);
    } else if (direction === 1 && row.nextElementSibling) {
        parent.insertBefore(row.nextElementSibling, row);
    }
}

function deleteRow(btn) {
    if (confirm('Delete this question?')) {
        btn.closest('tr').remove();
    }
}

function addNewEmptyQuestion() {
    const tbody = document.getElementById('editTableBody');
    const row = document.createElement('tr');
    const tempId = -Math.floor(Math.random() * 100000);
    row.dataset.id = tempId;
    row.innerHTML = `
        <td class="drag-handle"><i class="ph ph-dots-six-vertical"></i></td>
        <td style="color: var(--color-primary); font-size: 11px;">NEW</td>
        <td><textarea class="form-control q-edit-text" rows="2" placeholder="Question text..."></textarea></td>
        <td><textarea class="form-control q-edit-answer" rows="2" placeholder="Answer text..."></textarea></td>
        <td>
            <select class="options-select q-edit-type" style="font-size: 12px; height: 32px;">
                <option value="subjective">Subjective</option>
                <option value="objective">Objective</option>
                <option value="fill_in_the_blank">Fill-blank</option>
            </select>
        </td>
        <td>
            <div class="flex-align-center gap-sm">
                <button class="btn-icon" onclick="moveRow(this, -1)"><i class="ph ph-caret-up"></i></button>
                <button class="btn-icon" onclick="moveRow(this, 1)"><i class="ph ph-caret-down"></i></button>
                <button class="btn-icon" onclick="deleteRow(this)" style="color: var(--color-error);"><i class="ph ph-trash"></i></button>
            </div>
        </td>
    `;
    tbody.appendChild(row);
    row.scrollIntoView({ behavior: 'smooth' });
}

async function saveBulkEdits() {
    const rows = document.querySelectorAll('#editTableBody tr');
    const questions = [];

    rows.forEach((row, idx) => {
        const id = parseInt(row.dataset.id);
        const existing = currentQuestions.find(q => q.id === id) || {};
        
        questions.push({
            id: id < 0 ? null : id, 
            question_text: row.querySelector('.q-edit-text').value,
            answer_text: row.querySelector('.q-edit-answer').value,
            question_type: row.querySelector('.q-edit-type').value,
            order: idx,
            options: existing.options || null,
            explanation: existing.explanation || null,
            explanation_mode: existing.explanation_mode || null,
            explanation_output: existing.explanation_output || null
        });
    });

    try {
        const response = await fetch(`/quizzes/${currentQuiz.id}/questions/bulk`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ questions })
        });

        if (!response.ok) throw new Error('Bulk update failed');

        const data = await response.json();
        currentQuestions = data;

        document.getElementById('editModeModal').classList.remove('active');
        renderQuestions();
        alert('Quiz updated successfully!');

    } catch (error) {
        console.error('Error:', error);
        alert('Failed to save changes.');
    }
}
function setExplainMode(mode) {
    explainSettings.mode = mode;
    document.getElementById('explainMode').value = mode;
    saveExplainSettingsToStorage();
}

function setExplainOutput(output) {
    explainSettings.output = output;
    document.getElementById('explainOutput').value = output;
    saveExplainSettingsToStorage();
}

function updateExplainSettings() {
    explainSettings.scope = document.getElementById('explainScope').value;
    saveExplainSettingsToStorage();
}

/** Modal AI Settings */
function showExplainOptions(qId) {
    modalQId = qId;
    const q = currentQuestions.find(q => q.id == qId);
    
    // Default to question's current or global settings
    modalSettings.mode = q.explanation_mode || explainSettings.mode;
    modalSettings.output = q.explanation_output || explainSettings.output;
    modalSettings.scope = explainSettings.scope;

    // Sync UI
    document.getElementById('modalExplainScope').value = modalSettings.scope;
    setModalExplainMode(modalSettings.mode);
    setModalExplainOutput(modalSettings.output);

    document.getElementById('aiExplainOptionsModal').classList.add('active');
}

function setModalExplainMode(mode) {
    modalSettings.mode = mode;
    document.getElementById('modalExplainMode').value = mode;
}

function setModalExplainOutput(output) {
    modalSettings.output = output;
    document.getElementById('modalExplainOutput').value = output;
}

function regenerateFromModal() {
    // Update global settings briefly to trigger regeneration with these params
    const oldSettings = { ...explainSettings };
    explainSettings.scope = document.getElementById('modalExplainScope').value;
    explainSettings.mode = modalSettings.mode;
    explainSettings.output = modalSettings.output;

    closeModal('aiExplainOptionsModal');
    explainQuestion(modalQId, true); // Force regeneration

    // We don't necessarily want to change global sidebar settings permanently?
    // User might just want to change one question. 
    // But usually consistency is good. Let's keep them changed or revert?
    // Let's keep them changed to match user's latest preference.
    syncSidebarWithModal();
    saveExplainSettingsToStorage();
}

function syncSidebarWithModal() {
    document.getElementById('explainScope').value = explainSettings.scope;
    setExplainMode(explainSettings.mode);
    setExplainOutput(explainSettings.output);
}
