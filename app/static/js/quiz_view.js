// Quiz View Logic

let currentQuiz = null;
let currentQuestions = [];
let currentMode = 'showanswers';
let currentCardIndex = 0;
let examTimerInterval = null;
let timeRemaining = 15 * 60; // Default
let examAnswers = {};
let practiceResults = {}; // {qId: is_correct}

document.addEventListener('DOMContentLoaded', () => {
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
        const dateStr = new Date(currentQuiz.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        document.getElementById('infoDate').textContent = dateStr;
        
        // AI Metadata
        document.getElementById('infoModel').textContent = currentQuiz.model || 'Manual';
        document.getElementById('infoProcessing').textContent = currentQuiz.processing_time_ms ? `${currentQuiz.processing_time_ms}ms` : '—';

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
    
    // UI state reset
    document.getElementById('quizMainContent').style.filter = 'none';
    document.getElementById('quizMainContent').style.pointerEvents = 'all';
    
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
            } catch(e) {}
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
                            <td style="font-weight: 500;">${q.question_text}</td>
                            <td style="color: var(--color-success); font-weight: 600;">${q.answer_text}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
    container.appendChild(tableWrap);
}

function renderFlashcardMode(container) {
    if (currentCardIndex >= currentQuestions.length) currentCardIndex = 0;
    if (currentCardIndex < 0) currentCardIndex = currentQuestions.length - 1;
    
    const q = currentQuestions[currentCardIndex];
    document.getElementById('fcCounter').textContent = `${currentCardIndex + 1} / ${currentQuestions.length}`;
    
    const fcContainer = document.createElement('div');
    fcContainer.className = 'flashcard-container';
    
    const card = document.createElement('div');
    card.className = 'flashcard';
    card.onclick = () => card.classList.toggle('flipped');
    
    card.innerHTML = `
        <div class="flashcard-face">
            <span class="q-type-badge" style="position:absolute; top: 20px; left: 20px;">Question ${currentCardIndex + 1}</span>
            <div class="fc-content" style="font-size: 1.4rem; font-weight: 600; line-height: 1.5; color: var(--color-dark);">${q.question_text}</div>
            <div style="font-size: 12px; color: var(--color-gray); margin-top: 30px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                <i class="ph ph-arrow-u-up-right"></i> Click to reveal answer
            </div>
        </div>
        <div class="flashcard-face flashcard-back">
            <span class="q-type-badge" style="position:absolute; top: 20px; left: 20px; background: var(--color-primary); color: white;">Answer</span>
            <div class="fc-content" style="font-size: 1.3rem; font-weight: 600; color: var(--color-primary); line-height: 1.5;">${q.answer_text}</div>
            <div style="font-size: 12px; color: var(--color-gray); margin-top: 30px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                Click to flip back
            </div>
        </div>
    `;
    
    fcContainer.appendChild(card);
    container.appendChild(fcContainer);
}

function prevCard() {
    currentCardIndex--;
    renderQuestions();
}

function nextCard() {
    currentCardIndex++;
    renderQuestions();
}

function createQuestionCard(q, index) {
    const card = document.createElement('div');
    card.className = 'q-card';
    card.id = `q-${q.id}`;
    
    const header = document.createElement('div');
    header.className = 'q-header';
    header.innerHTML = `
        <div class="q-number">Question ${index + 1}</div>
        <div class="q-type-badge">${q.question_type.replace(/_/g, ' ')}</div>
    `;
    card.appendChild(header);
    
    const text = document.createElement('div');
    text.className = 'q-text';
    text.textContent = q.question_text;
    card.appendChild(text);
    
    // Practice & Exam mode inputs
    if (currentMode === 'practice' || currentMode === 'examsimulator') {
        if (q.question_type === 'objective' && q.options) {
            const optsContainer = document.createElement('div');
            optsContainer.className = 'q-options';
            let options = [];
            try { options = typeof q.options === 'string' ? JSON.parse(q.options) : q.options; } catch(e){}
            
            options.forEach((opt, optIdx) => {
                const optEl = document.createElement('div');
                optEl.className = 'q-option';
                
                // Restore state
                if (currentMode === 'examsimulator' && examAnswers[q.id] === opt) optEl.classList.add('selected');
                if (currentMode === 'practice' && practiceResults[q.id] !== undefined) {
                    if (opt.trim() === q.answer_text.trim()) optEl.classList.add('correct');
                    else if (examAnswers[q.id] === opt) optEl.classList.add('incorrect');
                }

                optEl.innerHTML = `<span style="opacity: 0.5; font-weight: 700;">${String.fromCharCode(65 + optIdx)}</span> <span>${opt}</span>`;
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
        
        const label = document.createElement('span');
        label.className = 'q-answer-label';
        label.textContent = 'Correct Answer';
        answerBox.appendChild(label);
        
        const answerContent = document.createElement('div');
        answerContent.style.fontWeight = "600";
        answerContent.textContent = q.answer_text;
        
        if (currentMode === 'hideanswers') {
            answerContent.className = 'hidden-content';
            answerContent.onclick = () => answerContent.classList.toggle('revealed');
            answerContent.title = "Click to reveal answer";
        }
        
        answerBox.appendChild(answerContent);
        card.appendChild(answerBox);
    }
    
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
        alert("Please provide an answer first.");
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
        alert("Failed to grade answer.");
        checkBtn.innerHTML = originalText;
        checkBtn.disabled = false;
    }
}

async function submitExam() {
    clearInterval(examTimerInterval);
    alert("Exam Simulator Finished! Review your answers in the standard or practice modes.");
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
        alert("Export failed: " + e.message);
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
