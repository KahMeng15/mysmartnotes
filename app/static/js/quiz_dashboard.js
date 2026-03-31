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
    const searchQuery = document.getElementById('quizSearch')?.value || '';
    const hasActiveSearch = searchQuery.trim().length > 0;
    
    // Sort overall data first
    let sortedData = [...quizzesData];
    sortedData.sort((a, b) => {
        if (sortBy === 'date-desc') return new Date(b.created_at) - new Date(a.created_at);
        if (sortBy === 'date-asc') return new Date(a.created_at) - new Date(b.created_at);
        if (sortBy === 'name') return a.title.localeCompare(b.title);
        return 0;
    });

    containerEl.innerHTML = '';

    if (sortedData.length === 0 && quizGroups.length === 0) {
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
    let renderedSections = 0;

    quizGroups.forEach(group => {
        const quizzes = grouped[group.id];
        if (quizzes.length > 0 || !hasActiveSearch) {
            containerEl.insertAdjacentHTML('beforeend', createGroupSection(group, quizzes));
            renderedSections += 1;
        }
    });

    // Render Ungrouped
    if (ungrouped.length > 0) {
        containerEl.insertAdjacentHTML('beforeend', createGroupSection({ id: 'none', name: 'Ungrouped' }, ungrouped, true));
        renderedSections += 1;
    }

    if (renderedSections === 0) {
        containerEl.innerHTML = `
            <div class="empty-state" style="padding: 40px; text-align: center;">
                <i class="ph ph-mask-sad" style="font-size: 48px; color: var(--color-gray); margin-bottom: 16px;"></i>
                <h3>No Quizzes Found</h3>
                <p style="color: var(--color-gray); margin-top: 8px;">Try a different search term or clear filters.</p>
            </div>
        `;
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
    document.getElementById('btnMethodImport').classList.toggle('active', method === 'import');
    
    document.getElementById('aiSection').style.display = method === 'ai' ? 'block' : 'none';
    document.getElementById('importSection').style.display = method === 'import' ? 'block' : 'none';
}

function setImportTab(tab) {
    document.getElementById('tabImportPaste').classList.toggle('active', tab === 'paste');
    document.getElementById('tabImportFile').classList.toggle('active', tab === 'file');
    document.getElementById('importPasteArea').style.display = tab === 'paste' ? 'block' : 'none';
    document.getElementById('importFileArea').style.display = tab === 'file' ? 'block' : 'none';
}

let importSelectedFiles = [];

function handleImportDragOver(e) {
    e.preventDefault();
    document.getElementById('importUploadArea').classList.add('drag-over');
}

function handleImportDragLeave(e) {
    e.preventDefault();
    document.getElementById('importUploadArea').classList.remove('drag-over');
}

function handleImportDrop(e) {
    e.preventDefault();
    document.getElementById('importUploadArea').classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        Array.from(files).forEach(f => importSelectedFiles.push(f));
        displayImportFiles();
    }
}

function handleImportFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        Array.from(files).forEach(f => importSelectedFiles.push(f));
        displayImportFiles();
    }
}

function displayImportFiles() {
    const placeholder = document.getElementById('importUploadPlaceholder');
    const display = document.getElementById('importFileDisplay');
    
    if (importSelectedFiles.length === 0) {
        placeholder.style.display = 'block';
        display.style.display = 'none';
        return;
    }

    placeholder.style.display = 'none';
    display.style.display = 'flex';
    display.style.flexDirection = 'column';
    display.style.gap = '8px';
    
    display.innerHTML = importSelectedFiles.map((file, index) => `
        <div class="file-item">
            <div class="flex-align-center gap-sm">
                <i class="ph ph-file-text" style="font-size: 24px; color: var(--color-primary);"></i>
                <div style="text-align: left;">
                    <div style="font-weight: 600; font-size: 14px;">${file.name}</div>
                    <div style="font-size: 11px; color: var(--color-gray);">${(file.size / 1024).toFixed(1)} KB</div>
                </div>
            </div>
            <button type="button" class="btn btn-outline btn-small" onclick="event.stopPropagation(); removeImportFile(${index})">Remove</button>
        </div>
    `).join('') + `
        <div class="margin-top-sm" style="text-align: right;">
            <button type="button" class="btn btn-outline btn-small" onclick="event.stopPropagation(); document.getElementById('importFileInput').click()">+ Add More Files</button>
        </div>
    `;
}

function removeImportFile(index) {
    importSelectedFiles.splice(index, 1);
    displayImportFiles();
}

function clearImportFile() {
    importSelectedFiles = [];
    document.getElementById('importFileInput').value = '';
    displayImportFiles();
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
    const stepText = document.getElementById('quizProgressStepText');
    
    if (fill) fill.style.width = `${percent}%`;
    if (percentText) percentText.textContent = `${percent}%`;
    if (msgText && message) msgText.textContent = message;
    if (labelText && label) labelText.textContent = label;
    // Update step hint with the current label as detail
    if (stepText && label) stepText.textContent = label;
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
            const progressModal = document.getElementById('quizProgressModal');
            if (progressModal) {
                progressModal.classList.add('active');
                updateQuizProgress(0, 'Initializing AI model...', 'Working...');
            }
            
            let currentPercent = 5;
            let progressInterval = setInterval(() => {
                if (currentPercent < 90) {
                    currentPercent += Math.random() * 5;
                    updateQuizProgress(Math.floor(currentPercent), 'Analyzing content and generating questions...', 'Processing');
                }
            }, 1500);

            try {
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
            } finally {
                clearInterval(progressInterval);
            }
            
        } else if (method === 'import') {
            const importTab = document.getElementById('tabImportPaste').classList.contains('active') ? 'paste' : 'file';
            const generateAnswers = document.getElementById('importGenerateAnswers').checked;
            
            // Title is intentionally NOT pre-filled here.
            // An empty title will cause the backend to use the AI-suggested title.
            
            // Show Progress Modal
            closeModal('createQuizModal');
            const progressModal = document.getElementById('quizProgressModal');
            if (progressModal) {
                progressModal.classList.add('active');
                updateQuizProgress(5, 'Initializing...', 'Starting');
            }

            const formData = new FormData();
            formData.append('title', title); // Empty = let AI suggest a title
            formData.append('quiz_group_id', quizGroupId || '');
            formData.append('generate_answers', generateAnswers);

            if (importTab === 'paste') {
                const text = document.getElementById('importText').value.trim();
                if (!text) throw new Error('Please paste some content first');
                formData.append('text', text);
                updateQuizProgress(15, 'Reading pasted content...', 'Loading content');
                await new Promise(r => setTimeout(r, 400));
                updateQuizProgress(25, 'Sending to processing engine...', 'Preparing');
            } else {
                if (importSelectedFiles.length === 0) throw new Error('Please select at least one file to import');
                importSelectedFiles.forEach(f => formData.append('file', f));
                const fileLabel = importSelectedFiles.map(f => f.name).join(', ');
                updateQuizProgress(15, `Reading ${importSelectedFiles.length} file(s)...`, fileLabel);
                await new Promise(r => setTimeout(r, 500));
                updateQuizProgress(25, 'Extracting text from documents...', 'Text extraction');
                await new Promise(r => setTimeout(r, 400));
                updateQuizProgress(35, 'Cleaning and pre-processing text...', 'Pre-processing');
            }

            // Start the fetch and animate progress while waiting
            const fetchPromise = fetch('/quizzes/import', { method: 'POST', body: formData });

            const importStages = [
                { pct: 45, msg: 'Sending to AI for analysis...', label: 'AI Analysis' },
                { pct: 55, msg: 'Identifying questions and answers...', label: 'Question detection' },
                { pct: 65, msg: 'Formatting lists and structure...', label: 'Rich formatting' },
                { pct: 73, msg: 'Suggesting a quiz title...', label: 'Title detection' },
                { pct: 82, msg: 'Validating extracted content...', label: 'Validation' },
                { pct: 90, msg: 'Finalizing quiz structure...', label: 'Almost done!' },
            ];
            let stageIdx = 0;
            const stageInterval = setInterval(() => {
                if (stageIdx < importStages.length) {
                    const s = importStages[stageIdx++];
                    updateQuizProgress(s.pct, s.msg, s.label);
                }
            }, 1800);

            try {
                response = await fetchPromise;
            } finally {
                clearInterval(stageInterval);
            }

            updateQuizProgress(95, 'Saving quiz to your library...', 'Saving');


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
            let errorMsg = 'Failed to create quiz';
            try {
                const contentType = response.headers.get("content-type");
                if (contentType && contentType.indexOf("application/json") !== -1) {
                    const errData = await response.json();
                    errorMsg = errData.detail || errorMsg;
                } else {
                    const textError = await response.text();
                    console.error('Non-JSON error response:', textError);
                }
            } catch (e) {
                console.error('Error parsing error response:', e);
            }
            throw new Error(errorMsg);
        }
        
        let quiz;
        try {
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                quiz = await response.json();
            } else {
                const rawText = await response.text();
                console.error('Expected JSON, got:', rawText);
                throw new Error('Server returned invalid data format');
            }
        } catch (e) {
            console.error('JSON Parse Error:', e);
            throw new Error('Failed to parse server response: ' + e.message);
        }
        
        if (method === 'ai' || method === 'import') {
            updateQuizProgress(100, 'Quiz generated successfully!', 'Complete');
            setTimeout(() => {
                closeModal('quizProgressModal');
                window.location.href = `/quiz/${quiz.id}`;
            }, 1000);
        } else {
            closeModal('createQuizModal');
            window.location.href = `/quiz/${quiz.id}`;
        }
        
    } catch (error) {
        console.error('Submit Error:', error);
        closeModal('quizProgressModal');
        // If we were in AI mode, re-open the create modal so they can see the error
        if (method === 'ai') {
            document.getElementById('createQuizModal').classList.add('active');
        }
        showError(error.message);
        if (typeof showErrorModal === 'function') {
            showErrorModal('Generation Failed', error.message);
        }
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
