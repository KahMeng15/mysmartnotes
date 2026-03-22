// Quiz Dashboard Logic

let allGroups = [];
let allSubjects = [];
let allLectures = [];
let quizGroups = []; // New Quiz Groups
let quizzesData = [];
let searchTimeout = null;
let minimizedGroups = new Set();

document.addEventListener('DOMContentLoaded', () => {
    loadQuizGroups();
    loadQuizzes();
    
    // Load selection data for the modal
    loadSelectionData();
});

// Load Quiz Groups
async function loadQuizGroups() {
    try {
        const response = await fetch('/quizzes/groups');
        if (!response.ok) throw new Error('Failed to fetch quiz groups');
        quizGroups = await response.json();
        populateQuizGroupSelectors();
    } catch (error) {
        console.error('Error loading quiz groups:', error);
    }
}

function populateQuizGroupSelectors() {
    const assignSelect = document.getElementById('assignToGroupSelect');
    const moveSelect = document.getElementById('moveDestinationSelect');
    
    const groupsHtml = quizGroups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
    
    if (assignSelect) {
        assignSelect.innerHTML = '<option value="">None (Ungrouped)</option>' + groupsHtml;
    }
    if (moveSelect) {
        moveSelect.innerHTML = '<option value="">None (Ungrouped)</option>' + groupsHtml;
    }
}

// Load user's quizzes with search
async function loadQuizzes() {
    const containerEl = document.getElementById('quizContainer');
    const searchQuery = document.getElementById('quizSearch')?.value || '';

    try {
        let url = `/quizzes/?q=${encodeURIComponent(searchQuery)}`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch quizzes');
        
        quizzesData = await response.json();
        renderQuizzes();
        
    } catch (error) {
        console.error('Error loading quizzes:', error);
        containerEl.innerHTML = `
            <div class="empty-state" style="color: var(--color-error);">
                <p>Error loading quizzes. Please try again later.</p>
            </div>
        `;
    }
}

function debounceSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        loadQuizzes();
    }, 500);
}

function renderQuizzes() {
    const containerEl = document.getElementById('quizContainer');
    const sortBy = document.getElementById('quizSort')?.value || 'date-desc';
    
    // Sort overall data first
    let sortedData = [...quizzesData];
    sortedData.sort((a, b) => {
        if (sortBy === 'date-desc') return new Date(b.created_at) - new Date(a.created_at);
        if (sortBy === 'date-asc') return new Date(a.created_at) - new Date(b.created_at);
        if (sortBy === 'name') return a.title.localeCompare(b.title);
        return 0;
    });

    containerEl.innerHTML = '';
    
    if (sortedData.length === 0) {
        containerEl.innerHTML = `
            <div class="empty-state" style="padding: 40px; text-align: center;">
                <i class="ph ph-mask-sad" style="font-size: 48px; color: var(--color-gray); margin-bottom: 16px;"></i>
                <h3>No Quizzes Found</h3>
                <p style="color: var(--color-gray); margin-top: 8px;">Try a different search term or generate a new quiz.</p>
            </div>
        `;
        return;
    }

    // Grouping
    const grouped = {};
    quizGroups.forEach(g => grouped[g.id] = []);
    const ungrouped = [];

    sortedData.forEach(quiz => {
        if (quiz.quiz_group_id && grouped[quiz.quiz_group_id]) {
            grouped[quiz.quiz_group_id].push(quiz);
        } else {
            ungrouped.push(quiz);
        }
    });

    // Render Groups
    quizGroups.forEach(group => {
        const quizzes = grouped[group.id];
        if (quizzes.length > 0 || !document.getElementById('quizSearch').value) {
            containerEl.insertAdjacentHTML('beforeend', createGroupSection(group, quizzes));
        }
    });

    // Render Ungrouped
    if (ungrouped.length > 0) {
        containerEl.insertAdjacentHTML('beforeend', createGroupSection({ id: 'none', name: 'Ungrouped' }, ungrouped, true));
    }
}

function createGroupSection(group, quizzes, isUngrouped = false) {
    const isMinimized = minimizedGroups.has(group.id);
    
    const quizzesHtml = quizzes.length > 0 ? `
        <div class="quiz-grid">
            ${quizzes.map(quiz => createQuizCardHtml(quiz)).join('')}
        </div>
    ` : `
        <div class="empty-state" style="padding: var(--spacing-lg);">
            No quizzes in this group.
        </div>
    `;

    let actionsHtml = '';
    if (!isUngrouped) {
        actionsHtml = `
            <div class="group-actions">
                <button onclick="event.stopPropagation(); openCreateModal('${group.id}')" class="btn btn-outline btn-small" title="Add Quiz to Group">
                    <i class="ph ph-plus"></i>
                </button>
                <button onclick="event.stopPropagation(); openEditGroupModal('${group.id}', '${group.name.replace(/'/g, "\\'")}')" class="btn btn-outline btn-small">
                    <i class="ph ph-pencil-simple"></i>
                </button>
                <button onclick="event.stopPropagation(); deleteQuizGroup('${group.id}')" class="btn btn-outline btn-small">
                    <i class="ph ph-trash"></i>
                </button>
            </div>
        `;
    } else {
        actionsHtml = `
            <div class="group-actions">
                <button onclick="event.stopPropagation(); openCreateModal('')" class="btn btn-outline btn-small" title="Add Quiz">
                    <i class="ph ph-plus"></i>
                </button>
            </div>
        `;
    }

    const minimizeButtonHtml = `
        <button onclick="event.stopPropagation(); toggleGroupMinimize('${group.id}')" class="btn btn-outline btn-small btn-minimize">
            ${isMinimized ? '<i class="ph ph-caret-right"></i>' : '<i class="ph ph-caret-down"></i>'}
        </button>
    `;

    return `
        <div class="group-section" data-group-id="${group.id}">
            <div class="group-header ${isMinimized ? 'minimized' : ''}">
                <div style="display: flex; align-items: center; gap: var(--spacing-md);">
                    ${minimizeButtonHtml}
                    <div class="group-title">
                        ${group.name}
                    </div>
                </div>
                ${actionsHtml}
            </div>
            <div class="subjects-grid" style="${isMinimized ? 'display: none;' : 'display: block;'}">
                ${quizzesHtml}
            </div>
        </div>
    `;
}

function createQuizCardHtml(quiz) {
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
    
    return `
        <div class="quiz-card" onclick="window.location.href = '/quiz/${quiz.id}'">
            <div class="quiz-card-header" style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
                <div class="quiz-card-icon" style="background: ${bgColor}; color: ${color};">
                    <i class="ph ph-exam"></i>
                </div>
                <div class="quiz-actions-menu">
                    <button class="btn btn-outline btn-small" onclick="event.stopPropagation(); toggleQuizActionMenu(event, '${quiz.id}')" title="Actions">
                        <i class="ph ph-dots-three-vertical"></i>
                    </button>
                    <div id="quiz-menu-${quiz.id}" class="quiz-dropdown-menu">
                        <button onclick="event.stopPropagation(); openEditQuizTitleModal('${quiz.id}', '${quiz.title.replace(/'/g, "\\'")}')">
                            <i class="ph ph-pencil-simple"></i> Edit Title
                        </button>
                        <button onclick="event.stopPropagation(); openMoveModal('${quiz.id}', '${quiz.quiz_group_id || ''}')">
                            <i class="ph ph-arrows-out-simple"></i> Move to Group
                        </button>
                        <button onclick="event.stopPropagation(); deleteQuiz('${quiz.id}')" style="color: var(--color-error);">
                            <i class="ph ph-trash"></i> Delete
                        </button>
                    </div>
                </div>
            </div>
            <div class="quiz-card-title">${quiz.title}</div>
            <div style="font-size: 13px; color: var(--color-gray); margin-bottom: 10px;">
                ${quiz.questions?.length || 0} Questions
            </div>
            <div class="quiz-card-meta">
                <span class="quiz-card-tag">${scopeLabel}</span>
                <div class="flex-align-center gap-sm">
                    <span style="display: flex; align-items: center; gap: 4px; font-size: 12px;"><i class="ph ph-calendar"></i> ${dateStr}</span>
                </div>
            </div>
        </div>
    `;
}

function toggleQuizActionMenu(event, quizId) {
    // Close all other menus
    document.querySelectorAll('.quiz-dropdown-menu').forEach(menu => {
        if (menu.id !== `quiz-menu-${quizId}`) {
            menu.classList.remove('active');
        }
    });
    
    const menu = document.getElementById(`quiz-menu-${quizId}`);
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

function toggleGroupMinimize(groupId) {
    if (minimizedGroups.has(groupId)) {
        minimizedGroups.delete(groupId);
    } else {
        minimizedGroups.add(groupId);
    }
    renderQuizzes();
}

// Group Management
function openGroupModal() {
    document.getElementById('groupModal').classList.add('active');
    document.getElementById('groupNameInput').value = '';
    document.getElementById('groupNameInput').focus();
}

async function handleCreateGroup(e) {
    e.preventDefault();
    const name = document.getElementById('groupNameInput').value.trim();
    if (!name) return;
    
    try {
        const response = await fetch('/quizzes/groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        
        if (response.ok) {
            closeModal('groupModal');
            showSuccessModal('Group Created', 'Your new quiz group has been created successfully!');
            await loadQuizGroups();
            renderQuizzes();
        }
    } catch (error) {
        console.error('Error creating group:', error);
    }
}

function openEditGroupModal(id, name) {
    document.getElementById('editGroupModal').classList.add('active');
    document.getElementById('editGroupId').value = id;
    document.getElementById('editGroupNameInput').value = name;
    document.getElementById('editGroupNameInput').focus();
}

async function handleEditGroup(e) {
    e.preventDefault();
    const id = document.getElementById('editGroupId').value;
    const name = document.getElementById('editGroupNameInput').value.trim();
    
    try {
        const response = await fetch(`/quizzes/groups/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        
        if (response.ok) {
            closeModal('editGroupModal');
            showSuccessModal('Group Updated', 'Your group has been updated successfully!');
            await loadQuizGroups();
            renderQuizzes();
        }
    } catch (error) {
        console.error('Error updating group:', error);
    }
}

async function deleteQuizGroup(id) {
    showConfirmModal('Are you sure you want to delete this group? Quizzes in this group will be moved to Ungrouped.', async () => {
        try {
            const response = await fetch(`/quizzes/groups/${id}`, { method: 'DELETE' });
            if (response.ok) {
                showSuccessModal('Group Deleted', 'The group has been deleted successfully!');
                await loadQuizGroups();
                loadQuizzes();
            }
        } catch (error) {
            console.error('Error deleting group:', error);
        }
    });
}

// Move Quiz
function openMoveModal(quizId, currentGroupId) {
    document.getElementById('moveQuizId').value = quizId;
    document.getElementById('moveDestinationSelect').value = currentGroupId || '';
    document.getElementById('moveQuizModal').classList.add('active');
}

async function submitMoveQuiz() {
    const quizId = document.getElementById('moveQuizId').value;
    const groupId = document.getElementById('moveDestinationSelect').value;
    
    try {
        const response = await fetch(`/quizzes/${quizId}/move?quiz_group_id=${groupId}`, {
            method: 'PUT'
        });
        
        if (response.ok) {
            closeModal('moveQuizModal');
            loadQuizzes();
        }
    } catch (error) {
        console.error('Error moving quiz:', error);
    }
}

// Modal Form handling
function openCreateModal(groupId = '') {
    document.getElementById('createError').style.display = 'none';
    document.getElementById('quizTitle').value = '';
    document.getElementById('assignToGroupSelect').value = groupId;
    document.getElementById('createQuizModal').classList.add('active');
}

function openEditQuizTitleModal(quizId, currentTitle) {
    document.getElementById('editQuizTitleModal').classList.add('active');
    document.getElementById('editQuizId').value = quizId;
    document.getElementById('editQuizTitleInput').value = currentTitle;
    document.getElementById('editQuizTitleInput').focus();
}

async function handleEditQuizTitle(e) {
    e.preventDefault();
    const quizId = document.getElementById('editQuizId').value;
    const newTitle = document.getElementById('editQuizTitleInput').value.trim();
    if (!newTitle) return;
    
    try {
        const response = await fetch(`/quizzes/${quizId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle })
        });
        
        if (response.ok) {
            closeModal('editQuizTitleModal');
            showSuccessModal('Title Updated', 'Quiz title has been updated successfully!');
            loadQuizzes(); // Refresh list
        } else {
            const err = await response.json();
            showErrorModal('Update Failed', err.detail || 'Failed to update quiz title');
        }
    } catch (error) {
        console.error('Error updating quiz title:', error);
        showErrorModal('Error', 'An unexpected error occurred.');
    }
}

async function deleteQuiz(quizId) {
    showConfirmModal('Are you sure you want to delete this quiz? This action cannot be undone.', async () => {
        try {
            const response = await fetch(`/quizzes/${quizId}`, { method: 'DELETE' });
            if (response.ok) {
                showSuccessModal('Quiz Deleted', 'The quiz has been deleted successfully!');
                loadQuizzes();
            } else {
                showErrorModal('Delete Failed', 'Failed to delete the quiz.');
            }
        } catch (error) {
            console.error('Error deleting quiz:', error);
            showErrorModal('Error', 'An unexpected error occurred.');
        }
    });
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
    const quizGroupId = document.getElementById('assignToGroupSelect').value;
    
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

            if (numQuestions < 1) throw new Error('Please enter at least 1 question');
            if (numQuestions > 500) throw new Error('Maximum number of questions is 500');
            
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
                    number_of_questions: numQuestions,
                    quiz_group_id: quizGroupId || null
                })
            });

            clearInterval(progressInterval);
            
        } else {
            // Manual creation
            if (!title) title = 'Manual Quiz';
            
            btn.innerHTML = '<i class="ph ph-spinner-gap ph-spin"></i> Creating...';
            btn.disabled = true;

            response = await fetch('/quizzes/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title,
                    scope_type: 'subject', // default
                    scope_id: null,
                    quiz_group_id: quizGroupId || null
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
