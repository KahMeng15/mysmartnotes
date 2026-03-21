// Quiz Dashboard Logic

let allGroups = [];
let allSubjects = [];
let allLectures = [];
let quizzesData = [];

document.addEventListener('DOMContentLoaded', () => {
    loadQuizzes();
    
    // Load selection data for the modal
    loadSelectionData();
});

// Load user's quizzes
async function loadQuizzes() {
    const listEl = document.getElementById('quizList');
    
    try {
        const response = await fetch('/quizzes/');
        if (!response.ok) throw new Error('Failed to fetch quizzes');
        
        quizzesData = await response.json();
        renderQuizzes();
        
    } catch (error) {
        console.error('Error loading quizzes:', error);
        listEl.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; color: var(--color-error);">
                <p>Error loading quizzes. Please try again later.</p>
            </div>
        `;
    }
}

function renderQuizzes() {
    const listEl = document.getElementById('quizList');
    const query = document.getElementById('quizSearch')?.value.toLowerCase() || '';
    const sortBy = document.getElementById('quizSort')?.value || 'date-desc';
    
    let filtered = quizzesData.filter(q => q.title.toLowerCase().includes(query));
    
    // Sorting
    filtered.sort((a, b) => {
        if (sortBy === 'date-desc') return new Date(b.created_at) - new Date(a.created_at);
        if (sortBy === 'date-asc') return new Date(a.created_at) - new Date(b.created_at);
        if (sortBy === 'name') return a.title.localeCompare(b.title);
        return 0;
    });
    
    if (filtered.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; padding: 40px; text-align: center;">
                <i class="ph ph-mask-sad" style="font-size: 48px; color: var(--color-gray); margin-bottom: 16px;"></i>
                <h3>No Quizzes Found</h3>
                <p style="color: var(--color-gray); margin-top: 8px;">Try a different search term or generate a new quiz.</p>
            </div>
        `;
        return;
    }
    
    listEl.innerHTML = '';
    filtered.forEach(quiz => {
        const card = document.createElement('div');
        card.className = 'quiz-card';
        card.onclick = () => window.location.href = `/quiz/${quiz.id}`;
        
        const dateStr = new Date(quiz.created_at).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        
        const hue = Array.from(quiz.title).reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
        const color = `hsl(${hue}, 60%, 45%)`;
        const bgColor = `hsl(${hue}, 60%, 96%)`;
        
        let scopeLabel = 'Note';
        if (quiz.scope_type === 'subject') scopeLabel = 'Subject';
        if (quiz.scope_type === 'group') scopeLabel = 'Group';

        card.innerHTML = `
            <div class="quiz-card-icon" style="background: ${bgColor}; color: ${color};">
                <i class="ph ph-exam"></i>
            </div>
            <div class="quiz-card-title">${quiz.title}</div>
            <div style="font-size: 13px; color: var(--color-gray); margin-bottom: 10px;">
                ${quiz.questions?.length || 0} Questions
            </div>
            <div class="quiz-card-meta">
                <span class="quiz-card-tag">${scopeLabel}</span>
                <span style="display: flex; align-items: center; gap: 4px;"><i class="ph ph-calendar"></i> ${dateStr}</span>
            </div>
        `;
        listEl.appendChild(card);
    });
}

function filterQuizzes() {
    renderQuizzes();
}

function sortQuizzes() {
    renderQuizzes();
}

// Modal Form handling
function openCreateModal() {
    document.getElementById('createError').style.display = 'none';
    document.getElementById('quizTitle').value = '';
    document.getElementById('createQuizModal').classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function setMethod(method) {
    document.getElementById('creationMethodInput').value = method;
    document.getElementById('btnMethodAi').classList.toggle('active', method === 'ai');
    document.getElementById('btnMethodManual').classList.toggle('active', method === 'manual');
    document.getElementById('aiSection').style.display = method === 'ai' ? 'block' : 'none';
    document.getElementById('manualSection').style.display = method === 'ai' ? 'none' : 'block';
}

async function loadSelectionData() {
    try {
        const [groupsRes, subjectsRes, lecturesRes] = await Promise.all([
            fetch('/groups'),
            fetch('/subjects'),
            fetch('/lectures')
        ]);
        
        allGroups = await groupsRes.json();
        allSubjects = await subjectsRes.json();
        allLectures = await lecturesRes.json();
        
        populateGroups();
    } catch (error) {
        console.error('Error loading selection data:', error);
        const groupSelect = document.getElementById('groupSelect');
        if (groupSelect) groupSelect.innerHTML = '<option value="">Error loading</option>';
    }
}

function populateGroups() {
    const groupSelect = document.getElementById('groupSelect');
    if (!groupSelect) return;
    
    groupSelect.innerHTML = '';
    
    if (allGroups.length === 0) {
        groupSelect.innerHTML = '<option value="">No groups available</option>';
        return;
    }
    
    allGroups.forEach(group => {
        const opt = document.createElement('option');
        opt.value = group.id;
        opt.textContent = group.name;
        groupSelect.appendChild(opt);
    });
    
    onGroupChange();
}

function onGroupChange() {
    const groupId = document.getElementById('groupSelect').value;
    const subjectSelect = document.getElementById('subjectSelect');
    if (!subjectSelect) return;
    
    subjectSelect.innerHTML = '<option value="all">All Subjects in Group</option>';
    
    const filteredSubjects = allSubjects.filter(s => s.group_id === groupId);
    filteredSubjects.forEach(subject => {
        const opt = document.createElement('option');
        opt.value = subject.id;
        opt.textContent = subject.name;
        subjectSelect.appendChild(opt);
    });
    
    onSubjectChange();
}

function onSubjectChange() {
    const subjectId = document.getElementById('subjectSelect').value;
    const groupId = document.getElementById('groupSelect').value;
    const lectureSelect = document.getElementById('lectureSelect');
    if (!lectureSelect) return;
    
    lectureSelect.innerHTML = '<option value="all">All Notes in Subject</option>';
    
    let filteredLectures = [];
    if (subjectId === 'all') {
        const subjectIds = allSubjects.filter(s => s.group_id === groupId).map(s => s.id);
        filteredLectures = allLectures.filter(l => subjectIds.includes(l.subject_id));
    } else {
        filteredLectures = allLectures.filter(l => l.subject_id === subjectId);
    }
    
    filteredLectures.forEach(lecture => {
        const opt = document.createElement('option');
        opt.value = lecture.id;
        opt.textContent = lecture.title;
        lectureSelect.appendChild(opt);
    });
}

function updateQuizProgress(percent, message, label) {
    const fill = document.getElementById('quizProgressFill');
    const percentText = document.getElementById('quizProgressPercent');
    const msgText = document.getElementById('quizProgressMessage');
    const labelText = document.getElementById('quizProgressLabel');
    
    if (fill) fill.style.width = `${percent}%`;
    if (percentText) percentText.textContent = `${percent}%`;
    if (msgText && message) msgText.textContent = message;
    if (labelText && label) labelText.textContent = label;
}

async function submitCreateQuiz() {
    let title = document.getElementById('quizTitle').value.trim();
    const method = document.getElementById('creationMethodInput').value;
    
    const btn = document.getElementById('modalCreateBtn');
    const originalText = btn.innerHTML;
    
    showError('');
    
    try {
        let response;
        if (method === 'ai') {
            const groupId = document.getElementById('groupSelect').value;
            const subjectId = document.getElementById('subjectSelect').value;
            const lectureId = document.getElementById('lectureSelect').value;
            const numQuestions = parseInt(document.getElementById('numQuestions').value) || 5;
            
            let scopeType, scopeId;
            let defaultTitle = '';
            
            if (lectureId && lectureId !== 'all') {
                scopeType = 'lecture';
                scopeId = lectureId;
                defaultTitle = document.getElementById('lectureSelect').options[document.getElementById('lectureSelect').selectedIndex].text;
            } else if (subjectId && subjectId !== 'all') {
                scopeType = 'subject';
                scopeId = subjectId;
                defaultTitle = document.getElementById('subjectSelect').options[document.getElementById('subjectSelect').selectedIndex].text;
            } else if (groupId) {
                scopeType = 'group';
                scopeId = groupId;
                defaultTitle = document.getElementById('groupSelect').options[document.getElementById('groupSelect').selectedIndex].text;
            }
            
            if (!scopeId) throw new Error('Please select a valid source (Group, Subject or Note)');
            
            if (!title) title = `${defaultTitle} Quiz`;
            
            // Get selected question types
            const qTypes = Array.from(document.querySelectorAll('input[name="qType"]:checked')).map(cb => cb.value);
            if (qTypes.length === 0) throw new Error('Please select at least one question type');
            
            // Show Progress Modal
            closeModal('createQuizModal');
            document.getElementById('quizProgressModal').classList.add('active');
            updateQuizProgress(0, 'Initializing AI model...', 'Working...');
            
            let currentPercent = 5;
            let progressInterval = setInterval(() => {
                if (currentPercent < 90) {
                    currentPercent += Math.random() * 5;
                    updateQuizProgress(Math.floor(currentPercent), 'Analyzing content and generating questions...', 'Processing');
                }
            }, 1500);

            response = await fetch('/quizzes/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title,
                    scope_type: scopeType,
                    scope_id: scopeId,
                    question_types: qTypes,
                    number_of_questions: numQuestions
                })
            });

            clearInterval(progressInterval);
            
        } else {
            // Manual creation (creates empty quiz for now, could parse text later)
            if (!title) title = 'Manual Quiz';
            
            btn.innerHTML = '<i class="ph ph-spinner-gap ph-spin"></i> Creating...';
            btn.disabled = true;

            response = await fetch('/quizzes/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title,
                    scope_type: 'subject', // default
                    scope_id: null
                })
            });
        }
        
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || 'Failed to create quiz');
        }
        
        const quiz = await response.json();
        
        if (method === 'ai') {
            updateQuizProgress(100, 'Complete!', 'Done');
            setTimeout(() => {
                document.getElementById('quizProgressModal').classList.remove('active');
                window.location.href = `/quiz/${quiz.id}`;
            }, 600);
        } else {
            closeModal('createQuizModal');
            window.location.href = `/quiz/${quiz.id}`;
        }
        
    } catch (error) {
        document.getElementById('quizProgressModal').classList.remove('active');
        // If we were in AI mode, re-open the create modal so they can see the error
        if (method === 'ai') {
            document.getElementById('createQuizModal').classList.add('active');
        }
        showError(error.message);
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function showError(msg) {
    const errEl = document.getElementById('createError');
    if (msg) {
        errEl.textContent = msg;
        errEl.style.display = 'block';
    } else {
        errEl.style.display = 'none';
    }
}
