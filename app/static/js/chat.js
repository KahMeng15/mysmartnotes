const API_URL = '';
const token = localStorage.getItem('token');

// ── State ────────────────────────────────────────────────────────────
let conversationMessages = [];   // Array of {role, content, time, ...} for current view
let conversations = [];          // List of ConversationSummary from API
let currentConversationId = null;// UUID of the active conversation (null = new)
let isViewingHistory = false;    // true when browsing a past conversation (read-only)
window.replyingToMessageId = null; // Index of message being replied to
window.replyingToMessageContent = null; // Content of message being replied to

let allGroups = [];
let allSubjects = [];
let allLectures = [];

let currentScope = { type: null, id: null, title: 'Select a scope to start' };
let currentAiMode = localStorage.getItem('globalAiMode') || 'normal';
let currentOutputFormat = localStorage.getItem('globalOutputFormat') || 'sentence';

// Modal state
let tempGroupId = null;
let tempSubjectId = null;
let tempNoteId = null;

// ── Persistence helpers ───────────────────────────────────────────
function loadSavedScope() {
    const saved = localStorage.getItem('chatScope');
    if (saved) { try { return JSON.parse(saved); } catch (e) { } }
    return null;
}

function saveScopeToStorage(scope) {
    localStorage.setItem('chatScope', JSON.stringify(scope));
}

// ── Build hierarchy title (main title only) ───────────────────────
function buildHierarchyTitle(type, id) {
    /** Build title for just the current item (note/subject/group) */
    if (type === 'note') {
        const note = allLectures.find(l => l.id == id);
        return note ? note.title : 'Note';
    } else if (type === 'subject') {
        const subject = allSubjects.find(s => s.id == id);
        return subject ? subject.name : 'Subject';
    } else if (type === 'group') {
        const group = allGroups.find(g => g.id == id);
        return group ? group.name : 'Group';
    }
    return 'Scope';
}

// ── Build hierarchy breadcrumb ────────────────────────────────────
function buildHierarchyBreadcrumb(type, id) {
    /** Build breadcrumb path like "Group > Subject > Note" */
    if (type === 'note') {
        const note = allLectures.find(l => l.id == id);
        if (!note) return '';
        const subject = allSubjects.find(s => s.id == note.subject_id);
        if (!subject) return '';
        const group = allGroups.find(g => g.id == subject.group_id);
        if (!group) return subject.name;
        return `${group.name} > ${subject.name}`;
    } else if (type === 'subject') {
        const subject = allSubjects.find(s => s.id == id);
        if (!subject) return '';
        const group = allGroups.find(g => g.id == subject.group_id);
        if (!group) return subject.name;
        return `${group.name} > ${subject.name}`;
    } else if (type === 'group') {
        const group = allGroups.find(g => g.id == id);
        return group ? group.name : '';
    }
    return '';
}

// ── UUID generator (fallback for older browsers) ──────────────────
function generateUUID() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

// ── AI Mode helpers ───────────────────────────────────────────────
const MODE_META = {
    quick: { label: 'Quick', icon: 'ph-lightning' },
    simple: { label: 'Simple', icon: 'ph-text-a-underline' },
    normal: { label: 'Normal', icon: 'ph-stack' },
    elaborate: { label: 'Elaborate', icon: 'ph-lightbulb' },
    eli5: { label: 'ELI5', icon: 'ph-smiley' },
};

const OUTPUT_FORMAT_META = {
    sentence: { label: 'Sentence', icon: 'ph-text-t' },
    pointform: { label: 'Pointform', icon: 'ph-list-bullets' },
    numbered_list: { label: 'Numbered List', icon: 'ph-list-numbers' },
    table: { label: 'Table', icon: 'ph-table' },
};

function setAiMode(mode) {
    currentAiMode = mode;
    document.querySelectorAll('.ai-mode-bar .mode-pill').forEach(p => {
        p.classList.toggle('active', p.dataset.mode === mode);
    });
    localStorage.setItem('globalAiMode', mode);
}

function setOutputFormat(format) {
    currentOutputFormat = format;
    document.querySelectorAll('.output-format-bar .mode-pill').forEach(p => {
        p.classList.toggle('active', p.dataset.format === format);
    });
    localStorage.setItem('globalOutputFormat', format);
}

// Apply saved mode and output format on load
function applySavedMode() {
    setAiMode(currentAiMode);
    setOutputFormat(currentOutputFormat);
}

// ── Bootstrap ─────────────────────────────────────────────────────
window.addEventListener('load', () => {
    if (!token) { window.location.href = '/login'; return; }
    applySavedMode();
    loadData();
    setupMessageInput();
});

async function loadData() {
    try {
        const [gRes, sRes, lRes, cRes] = await Promise.all([
            fetch('/groups', { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch('/subjects', { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch('/lectures', { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch('/chat/conversations', { headers: { 'Authorization': `Bearer ${token}` } }),
        ]);

        if (gRes.ok) allGroups = await gRes.json();
        if (sRes.ok) allSubjects = await sRes.json();
        if (lRes.ok) allLectures = await lRes.json();
        if (cRes.ok) conversations = await cRes.json();

        renderConversationList();
        populateGroupSelect();

        // URL param pre-selection
        const urlParams = new URLSearchParams(window.location.search);
        const urlNoteId = urlParams.get('lecture_id') || urlParams.get('note_id');
        if (urlNoteId) {
            const note = allLectures.find(l => l.id == urlNoteId);
            if (note) { setScope('note', note.id, `Note: ${note.title}`); }
            else { openScopeModal(); }
        } else {
            const savedScope = loadSavedScope();
            if (savedScope && savedScope.type && savedScope.id) {
                let exists = false;
                if (savedScope.type === 'note') exists = allLectures.some(l => l.id == savedScope.id);
                if (savedScope.type === 'subject') exists = allSubjects.some(s => s.id == savedScope.id);
                if (savedScope.type === 'group') exists = allGroups.some(g => g.id == savedScope.id);
                if (exists) { setScope(savedScope.type, savedScope.id, savedScope.title); }
                else { localStorage.removeItem('chatScope'); openScopeModal(); }
            } else {
                openScopeModal();
            }
        }
    } catch (e) {
        console.error('Error loading data', e);
        document.getElementById('conversationList').innerHTML =
            `<p style="color:var(--color-error);padding:var(--spacing-md);text-align:center;">Failed to load conversations.</p>`;
    }
}

// ── Scope Modal ───────────────────────────────────────────────────
function openScopeModal() {
    document.getElementById('scopeModal').classList.add('active');

    // First, populate group select
    populateGroupSelect();

    // Preselect current scope
    if (currentScope.type === 'group' && currentScope.id) {
        document.getElementById('groupSelect').value = currentScope.id;
        onGroupChange();
    } else if (currentScope.type === 'subject' && currentScope.id) {
        // Find subject's group and set group first
        const subject = allSubjects.find(s => s.id == currentScope.id);
        if (subject) {
            document.getElementById('groupSelect').value = subject.group_id;
            onGroupChange();
            document.getElementById('subjectSelect').value = currentScope.id;
            onSubjectChange();
        }
    } else if (currentScope.type === 'note' && currentScope.id) {
        // Find note's subject and group, then set all three
        const note = allLectures.find(l => l.id == currentScope.id);
        if (note) {
            const subject = allSubjects.find(s => s.id == note.subject_id);
            if (subject) {
                document.getElementById('groupSelect').value = subject.group_id;
                onGroupChange();
                document.getElementById('subjectSelect').value = note.subject_id;
                onSubjectChange();
                document.getElementById('noteSelect').value = currentScope.id;
                onNoteChange();
            }
        }
    } else {
        // No current scope, reset to defaults
        document.getElementById('groupSelect').value = '';
        document.getElementById('subjectSelect').value = '';
        document.getElementById('subjectSelect').disabled = true;
        document.getElementById('subjectSelect').innerHTML = '<option value="">-- Entire Group (Select Group First) --</option>';
        document.getElementById('noteSelect').value = '';
        document.getElementById('noteSelect').disabled = true;
        document.getElementById('noteSelect').innerHTML = '<option value="">-- Entire Subject (Select Subject First) --</option>';
        checkConfirmBtn();
    }
}

function closeScopeModal() {
    document.getElementById('scopeModal').classList.remove('active');
}

function populateGroupSelect() {
    const select = document.getElementById('groupSelect');
    select.innerHTML = '<option value="">-- Select a Group --</option>';
    allGroups.forEach(g => { select.innerHTML += `<option value="${g.id}">${g.name}</option>`; });
}

function onGroupChange() {
    tempGroupId = document.getElementById('groupSelect').value;
    const subSelect = document.getElementById('subjectSelect');
    const noteSelect = document.getElementById('noteSelect');
    if (tempGroupId) {
        subSelect.disabled = false;
        subSelect.innerHTML = '<option value="">-- Entire Group --</option>';
        allSubjects.filter(s => s.group_id == tempGroupId)
            .forEach(s => { subSelect.innerHTML += `<option value="${s.id}">${s.name}</option>`; });
    } else {
        subSelect.disabled = true;
        subSelect.innerHTML = '<option value="">-- Entire Group (Select Group First) --</option>';
    }
    noteSelect.disabled = true;
    noteSelect.innerHTML = '<option value="">-- Entire Subject (Select Subject First) --</option>';
    checkConfirmBtn();
}

function onSubjectChange() {
    tempSubjectId = document.getElementById('subjectSelect').value;
    const noteSelect = document.getElementById('noteSelect');
    if (tempSubjectId) {
        noteSelect.disabled = false;
        noteSelect.innerHTML = '<option value="">-- Entire Subject --</option>';
        allLectures.filter(l => l.subject_id == tempSubjectId)
            .forEach(n => { noteSelect.innerHTML += `<option value="${n.id}">${n.title}</option>`; });
    } else {
        noteSelect.disabled = true;
        noteSelect.innerHTML = '<option value="">-- Entire Subject (Select Subject First) --</option>';
    }
    checkConfirmBtn();
}

function onNoteChange() {
    tempNoteId = document.getElementById('noteSelect').value;
    checkConfirmBtn();
}

function checkConfirmBtn() {
    const grp = document.getElementById('groupSelect').value;
    const sub = document.getElementById('subjectSelect').value;
    const nte = document.getElementById('noteSelect').value;
    document.getElementById('confirmScopeBtn').disabled = !(grp || sub || nte);
}

function confirmScope() {
    const noteId = document.getElementById('noteSelect').value;
    const subId = document.getElementById('subjectSelect').value;
    const grpId = document.getElementById('groupSelect').value;
    if (noteId) {
        const note = allLectures.find(l => l.id == noteId);
        setScope('note', noteId, `Note: ${note ? note.title : 'Unknown'}`);
    } else if (subId) {
        const sub = allSubjects.find(s => s.id == subId);
        setScope('subject', subId, `Subject: ${sub ? sub.name : 'Unknown'}`);
    } else if (grpId) {
        const grp = allGroups.find(g => g.id == grpId);
        setScope('group', grpId, `Group: ${grp ? grp.name : 'Unknown'}`);
    }
    closeScopeModal();
}

function setScope(type, id, title) {
    currentScope = { type, id, title };
    saveScopeToStorage(currentScope);
    document.getElementById('contextDisplay').style.display = 'flex';
    document.getElementById('messageInput').disabled = false;
    document.getElementById('sendBtn').disabled = false;

    // Start a fresh conversation (don't wipe messages if already viewing one)
    if (!isViewingHistory) {
        currentConversationId = null;
        conversationMessages = [];
        const hierarchyTitle = buildHierarchyTitle(type, id);
        const breadcrumb = buildHierarchyBreadcrumb(type, id);
        document.getElementById('chatTitle').textContent = hierarchyTitle;
        document.getElementById('chatSubtitle').textContent = breadcrumb || 'Ask questions about your notes, subjects, or groups';
        document.getElementById('chatMeta').style.display = 'none';
        displayMessages();
    }
    document.getElementById('messageInput').focus();
}

function createNewChat() {
    currentScope = { type: null, id: null, title: 'New Chat' };
    currentConversationId = null;
    conversationMessages = [];
    isViewingHistory = false;
    document.getElementById('chatTitle').textContent = 'New Chat';
    document.getElementById('chatSubtitle').textContent = 'Ask questions about your notes, subjects, or groups';
    document.getElementById('chatMeta').style.display = 'none';
    document.getElementById('contextDisplay').style.display = 'none';
    document.getElementById('messageInput').disabled = true;
    document.getElementById('sendBtn').disabled = true;
    document.getElementById('messageInput').value = '';
    // deselect sidebar
    document.querySelectorAll('.conversation-item').forEach(el => el.classList.remove('active'));
    displayMessages();
    openScopeModal();
}

function setupMessageInput() {
    document.getElementById('messageInput').addEventListener('keypress', e => {
        if (e.key === 'Enter') sendMessage();
    });
}

// ── Send Message ──────────────────────────────────────────────────
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    if (!message || !currentScope.id) return;

    // Exit history view mode — user is continuing/adding a message
    isViewingHistory = false;
    document.getElementById('chatMeta').style.display = 'none';

    // Generate conversation ID if this is a new chat
    if (!currentConversationId) {
        currentConversationId = generateUUID();
    }

    // Capture reply info before clearing
    const replyInfo = window.replyingToMessageId !== null && window.replyingToMessageId !== undefined ? {
        id: window.replyingToMessageId,
        content: window.replyingToMessageContent
    } : null;

    // Add user message to local state
    const userMsg = {
        id: undefined, // Will be set on history fetch or if backend returns it
        role: 'user',
        content: message,
        time: new Date(),
        ai_mode: currentAiMode,
        replyTo: replyInfo  // Include reply information
    };
    conversationMessages.push(userMsg);
    input.value = '';

    // Clear reply indicator after sending
    clearReply();

    displayMessages();

    // Loading bubble
    conversationMessages.push({
        role: 'ai', loading: true,
        content: '<div class="loading-message"><span class="spinner"><i class="ph-spinner"></i></span> <span id="loading-text">Processing</span></div>',
        time: new Date()
    });
    displayMessages();

    let currentLoadingTextIdx = 0;
    const loadingTexts = [
        "Processing...",
        "Retrieving from local knowledge...",
        "Searching the web...",
        "Building an answer..."
    ];
    const loadingInterval = setInterval(() => {
        const el = document.getElementById('loading-text');
        if (el) {
            currentLoadingTextIdx = Math.min(currentLoadingTextIdx + 1, loadingTexts.length - 1);
            el.innerText = loadingTexts[currentLoadingTextIdx];
        }
    }, 1000);

    const payload = {
        message,
        ai_mode: currentAiMode,
        output_format: currentOutputFormat,
        conversation_id: currentConversationId,
        auto_detect_conversation: true,  // Enable auto-detection
        reply_to_message_id: replyInfo ? replyInfo.id : null  // Send ID to backend
    };
    if (currentScope.type === 'note') payload.lecture_id = currentScope.id;
    else if (currentScope.type === 'subject') payload.subject_id = currentScope.id;
    else if (currentScope.type === 'group') payload.group_id = currentScope.id;

    try {
        const resp = await fetch(`${API_URL}/chat/ask`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });

        clearInterval(loadingInterval);
        conversationMessages.pop(); // remove loading

        if (resp.ok) {
            const data = await resp.json();

            conversationMessages.push({
                role: 'ai',
                content: data.response,
                time: new Date(),
                sources: data.sources,
                ai_model: data.ai_model,
                ai_mode: data.ai_mode || currentAiMode,
                detailed_sources: data.detailed_sources || [],
                thinking: data.thinking || null,
                timings: data.timings,
            });

            // Update conversation ID (backend may have confirmed it or changed it)
            if (data.conversation_id) currentConversationId = data.conversation_id;

            // Update meta with question count
            const questionCount = conversationMessages.filter(m => m.role === 'user').length;
            document.getElementById('chatMeta').textContent = `${questionCount} question(s)`;
            document.getElementById('chatMeta').style.display = 'block';

            await fetchConversations(); // refresh sidebar
        } else {
            conversationMessages.push({
                role: 'ai',
                content: `Sorry, I encountered an error (${resp.status}). Please try again.`,
                time: new Date()
            });
        }
    } catch (err) {
        clearInterval(loadingInterval);
        conversationMessages.pop();
        conversationMessages.push({ role: 'ai', content: 'Network error: ' + err.message, time: new Date() });
    }

    displayMessages();
}

// ── Reply Functions ───────────────────────────────────────────────
function setReply(messageIndex) {
    const msg = conversationMessages[messageIndex];
    window.replyingToMessageId = messageIndex;
    window.replyingToMessageContent = msg.content.replace(/<[^>]*>/g, '').substring(0, 100); // Strip HTML and limit length
    displayMessages();
    document.getElementById('messageInput').focus();
}

function clearReply() {
    window.replyingToMessageId = null;
    window.replyingToMessageContent = null;
    displayMessages();
}

// ── Display Messages ──────────────────────────────────────────────
function displayMessages() {
    const container = document.getElementById('messagesContainer');

    if (conversationMessages.length === 0) {
        const scopeLabel = isViewingHistory ? 'this conversation' : (currentScope.title || 'your notes');
        container.innerHTML = `
            <div class="empty-state">
                <div style="font-size:var(--font-size-3xl);margin-bottom:0;">
                    <i class="ph ph-chat-circle-dots"></i></div>
                <p style="margin-top:var(--spacing-md);">Ready to dive in? Ask a question and uncover the insights hidden in your notes!</p>
            </div>`;
        return;
    }

    // Inject reply indicator ABOVE the input box area (in .chat-main)
    const chatMain = document.querySelector('.chat-main');
    const existingIndicator = document.getElementById('chat-form-reply-indicator');
    if (existingIndicator) existingIndicator.remove();

    if (window.replyingToMessageId !== null && window.replyingToMessageId !== undefined) {
        const replyMsg = conversationMessages[window.replyingToMessageId];
        if (replyMsg) {
            const replyPreview = replyMsg.content.replace(/<[^>]*>/g, '').replace(/\[\d+\]/g, '');
            const indicatorDiv = document.createElement('div');
            indicatorDiv.id = 'chat-form-reply-indicator';
            indicatorDiv.innerHTML = `
                <div class="reply-indicator">
                    <div class="reply-indicator-header">
                        <i class="ph ph-arrow-bend-up-right"></i>
                        Replying to ${replyMsg.role === 'user' ? 'your message' : 'AI'}
                        <button class="close-reply-btn" onclick="clearReply()">
                            <i class="ph ph-x"></i>
                        </button>
                    </div>
                    <div class="reply-indicator-content">"${replyPreview}"</div>
                </div>`;

            const inputArea = document.querySelector('.chat-input-area');
            chatMain.insertBefore(indicatorDiv, inputArea);
        }
    }

    let messagesHTML = conversationMessages.map((msg, idx) => {
        let contentHTML = msg.content;
        let referencesHTML = '';
        if (msg.role === 'ai' && !msg.loading && typeof marked !== 'undefined') {
            try { contentHTML = marked.parse(contentHTML); } catch (e) { }
            // Parse citations in the response if there are sources
            if (msg.detailed_sources && msg.detailed_sources.length > 0) {
                contentHTML = parseCitations(contentHTML);
            }
        }

        // AI mode badge (will be moved to metadata section)
        let modeMeta = null;
        if (msg.role === 'ai' && !msg.loading && msg.ai_mode) {
            modeMeta = MODE_META[msg.ai_mode] || { label: msg.ai_mode, icon: 'ph-sparkle' };
        }

        // Thinking section
        let thinkingHTML = '';
        if (msg.thinking) {
            thinkingHTML = `
                <div class="thinking-section">
                    <div class="thinking-header" onclick="toggleThinking(this)">
                        <span class="thinking-icon"><i class="ph ph-caret-right"></i></span>
                        <span>🧠 AI Thinking Process</span>
                    </div>
                    <div class="thinking-content">
                        ${msg.thinking.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
                    </div>
                </div>`;
        }

        // Sources & metadata
        let sourcesHTML = '';
        let metadataHTML = '';
        const hasSources = msg.detailed_sources && msg.detailed_sources.length > 0;

        if (hasSources || msg.ai_model || msg.timings || modeMeta) {
            const msgId = 'msg-' + idx;
            let highestMatch = 0;
            if (hasSources) {
                highestMatch = Math.max(...msg.detailed_sources.map(s => s.score || 0));
                const isWebSearch = msg.detailed_sources.some(s => s.is_web);

                if (isWebSearch && msg.role === 'ai') {
                    contentHTML = `<div style="margin-bottom:12px;display:inline-flex;align-items:center;gap:6px;background:#eef2ff;color:#4f46e5;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;"><i class="ph ph-globe"></i> Searched the Web</div>\n` + contentHTML;
                }

                const sourceLinks = msg.detailed_sources.map((src, si) => {
                    const citationNum = si + 1;
                    const score = src.score ? ` (${src.score}% match)` : '';
                    if (src.is_web) {
                        return `
                            <div class="source-item" onclick="window.open('${src.url}', '_blank')"
                                    style="cursor:pointer;padding:6px 10px;margin:4px 0;background:white;border:1px solid #e0e0e0;border-radius:4px;transition:all 0.2s;font-size:11px;">
                                <div style="font-weight:600;color:#1976d2;margin-bottom:2px;">
                                    <i class="ph ph-globe"></i> [${citationNum}] Web Reference${score}
                                </div>
                                <div style="color:#666;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                                    ${src.url}
                                </div>
                                <div style="color:#999;font-size:9px;margin-top:2px;">${src.title || ''}</div>
                            </div>`;
                    }

                    const lectureId = src.lecture_id || currentScope.id;
                    const preview = src.text_preview || 'View reference';
                    return `
                        <div class="source-item" onclick="openSourceReference('${lectureId}', ${src.position || 0})"
                                style="cursor:pointer;padding:6px 10px;margin:4px 0;background:white;border:1px solid #e0e0e0;border-radius:4px;transition:all 0.2s;font-size:11px;">
                            <div style="font-weight:600;color:#1976d2;margin-bottom:2px;">
                                <i class="ph ph-file-text"></i> [${citationNum}] Reference${score}
                            </div>
                            <div style="color:#666;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                                "${preview}"
                            </div>
                        </div>`;
                }).join('');
                sourcesHTML = `<div class="sources-section" style="margin-top:10px;padding:8px;background:#f9f9f9;border-radius:4px;">${sourceLinks}</div>`;
            }

            const aiModel = msg.ai_model || null;
            const t = msg.timings || null;
            let infoContent = `
                <div style="margin-top:10px;padding:12px;background:#f9f9f9;border-radius:4px;font-size:12px;">
                    <div style="margin-bottom:${t ? '10px' : '0'}">
                        <div style="font-weight:600;color:#333;margin-bottom:4px;"><i class="ph ph-robot"></i> Model: ${aiModel || '<span style="color:#aaa">Unknown</span>'}</div>
                    </div>
                    ${t && t.step_times ? `
                    <div style="border-top:1px solid #e0e0e0;padding-top:8px;">
                        <div style="font-weight:600;color:#333;margin-bottom:6px;"><i class="ph ph-list-numbers"></i> Process Timing (Milliseconds)</div>
                        <div style="display:flex;justify-content:space-between;padding:2px 0;">
                            <span>1. Scope Identification:</span><span style="font-weight:600;">${t.step_times.step1.toFixed(2)}ms</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:2px 0;">
                            <span>2. Conversation Detection:</span><span style="font-weight:600;">${t.step_times.step2.toFixed(2)}ms</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:2px 0;">
                            <span>3. Intent Classification:</span><span style="font-weight:600;">${t.step_times.step3.toFixed(2)}ms</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:2px 0;">
                            <span>4. Local Context Retrieval:</span><span style="font-weight:600;">${t.step_times.step4.toFixed(2)}ms</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:2px 0;">
                            <span>5. Web Search Fallback:</span><span style="font-weight:600;">${t.step_times.step5.toFixed(2)}ms</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:2px 0;">
                            <span>6. Prompt Building:</span><span style="font-weight:600;">${t.step_times.step6.toFixed(2)}ms</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:2px 0;">
                            <span>7. AI Answer Generation:</span><span style="font-weight:600;">${t.step_times.step7.toFixed(2)}ms</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:2px 0;">
                            <span>8. Citation Injection:</span><span style="font-weight:600;">${t.step_times.step8.toFixed(2)}ms</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid #f0f0f0;">
                            <span>9. Save & Housekeeping:</span><span style="font-weight:600;">${t.step_times.step9.toFixed(2)}ms</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:4px 0;margin-top:4px;">
                            <span>Total:</span><span style="color:var(--color-primary);font-weight:600;">${t.total_ms.toFixed(2)}ms</span>
                        </div>
                    </div>` : t ? `
                    <div style="border-top:1px solid #e0e0e0;padding-top:8px;">
                        <div style="font-weight:600;color:#333;margin-bottom:6px;"><i class="ph ph-hourglass"></i> Timing</div>
                        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f0f0f0;">
                            <span>Retrieval:</span><span style="color:var(--color-primary);font-weight:600;">${t.retrieval_ms}ms</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f0f0f0;">
                            <span>Model:</span><span style="color:var(--color-primary);font-weight:600;">${t.model_ms}ms</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:4px 0;">
                            <span>Total:</span><span style="color:var(--color-primary);font-weight:600;">${t.total_ms}ms</span>
                        </div>
                    </div>` : ''}
                </div>`;

            const refLabel = hasSources ? `Reference (${highestMatch}%)` : 'Reference';
            let toggleContent = '';

            if (modeMeta) {
                toggleContent += `<span style="display:inline-flex;align-items:center;gap:4px;color:#666;"><i class="ph ${modeMeta.icon}"></i> ${modeMeta.label}</span><span class="reference-divider">|</span>`;
            }

            toggleContent += `<span onclick="toggleMetadata('${msgId}-ref','${msgId}')" style="cursor:pointer;">${refLabel}</span><span class="reference-divider">|</span><button class="info-btn" onclick="toggleMetadata('${msgId}-info','${msgId}',event)">Info</button>`;

            metadataHTML = `
                <div class="message-metadata">
                    <div class="metadata-toggle">
                        ${toggleContent}
                    </div>
                    <div class="metadata-content" id="${msgId}-ref-content">${sourcesHTML}</div>
                    <div class="metadata-content" id="${msgId}-info-content">${infoContent}</div>
                </div>`;
        }

        const timeStr = formatMessageTime(msg.time instanceof Date ? msg.time : new Date(msg.time));

        // WhatsApp-style reply quote
        let replyQuoteHTML = '';
        if (msg.replyTo && msg.role === 'user') {
            const replyAuthor = msg.replyTo.id !== undefined ? (conversationMessages[msg.replyTo.id]?.role === 'user' ? 'You' : 'AI') : 'Unknown';
            const replyText = msg.replyTo.content?.replace(/<[^>]*>/g, '').replace(/\[\d+\]/g, '') || 'Replied message';
            replyQuoteHTML = `
                <div class="message-reply-quote">
                    <span class="message-reply-quote-author">↳ ${replyAuthor}</span>
                    <span class="message-reply-quote-text">"${replyText}"</span>
                </div>`;
        }

        // Check if this message is the one being replied to (only highlight for user messages, as requested)
        const isHighlightedForReply = (window.replyingToMessageId === idx && msg.role === 'user') ? ' highlighted-for-reply' : '';

        // Reply button only for non-loading messages
        let actionsHTML = '';
        if (!msg.loading && !isViewingHistory) {
            actionsHTML = `
                <button class="action-btn" title="Reply to this message" onclick="setReply(${idx})">
                    <i class="ph ph-arrow-bend-up-right"></i>
                </button>`;
        }

        return `
        <div class="message ${msg.role}${isHighlightedForReply}">
            <div class="message-content">
                ${replyQuoteHTML}
                ${thinkingHTML}
                ${contentHTML}
                ${metadataHTML}
            </div>
            <div class="message-side">
                ${actionsHTML ? `<div class="message-actions">${actionsHTML}</div>` : ''}
                <div class="message-time">${timeStr}</div>
            </div>
        </div>`;
    }).join('');

    // Set messages only
    container.innerHTML = messagesHTML;
    container.scrollTop = container.scrollHeight;
}

function toggleThinking(header) {
    header.querySelector('.thinking-icon').classList.toggle('expanded');
    header.nextElementSibling.classList.toggle('expanded');
}

// ── Conversation Sidebar ──────────────────────────────────────────
async function fetchConversations() {
    try {
        const res = await fetch('/chat/conversations', { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) { conversations = await res.json(); renderConversationList(); }
    } catch (e) { console.error('fetchConversations error', e); }
}

function renderConversationList() {
    const list = document.getElementById('conversationList');
    if (!conversations || conversations.length === 0) {
        list.innerHTML = `<div class="empty-state" style="padding:var(--spacing-md);">
            <p style="font-size:var(--font-size-sm);">No conversations yet</p></div>`;
        return;
    }

    // Group by date (using device's local timezone)
    const today = getDateInTimezone(new Date());
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 7);

    const groups = { 'Pinned': [], 'Today': [], 'Yesterday': [], 'This Week': [], 'Earlier': [] };
    conversations.forEach(c => {
        if (c.is_pinned) {
            groups['Pinned'].push(c);
            return;
        }
        const d = getDateInTimezone(parseUTCDate(c.last_message_at));
        if (d >= today) groups['Today'].push(c);
        else if (d >= yesterday) groups['Yesterday'].push(c);
        else if (d >= weekAgo) groups['This Week'].push(c);
        else groups['Earlier'].push(c);
    });

    const scopeIcon = { note: 'ph-file-text', subject: 'ph-books', group: 'ph-folder-open' };
    const scopeLabel = { note: 'Note', subject: 'Subject', group: 'Group' };

    let html = '';
    for (const [groupName, items] of Object.entries(groups)) {
        if (!items.length) continue;
        html += `<div class="date-group-label">${groupName}</div>`;
        items.forEach(c => {
            const isActive = c.conversation_id === currentConversationId;
            const d = parseUTCDate(c.last_message_at);
            const dateStr = formatMessageDateAndTime(d);
            const icon = scopeIcon[c.scope_type] || 'ph-chat-circle';
            const scope = scopeLabel[c.scope_type] || '';
            const msgWord = c.message_count === 1 ? 'msg' : 'msgs';

            let convTitle = c.title || 'Untitled Conversation';
            let scopeDetail = scope;

            if (c.scope_type === 'note') {
                const note = allLectures.find(x => x.id == c.lecture_id);
                if (note) convTitle = note.title;

                let subjId = c.subject_id;
                if (note && !subjId) subjId = note.subject_id;

                const subj = allSubjects.find(x => x.id == subjId);

                let grpId = c.group_id;
                if (subj && !grpId) grpId = subj.group_id;

                const grp = allGroups.find(x => x.id == grpId);

                if (subj && grp) scopeDetail = `${subj.name} (${grp.name})`;
                else if (subj) scopeDetail = subj.name;
                else if (grp) scopeDetail = grp.name;
            } else if (c.scope_type === 'subject') {
                const subj = allSubjects.find(x => x.id == c.subject_id);
                if (subj) convTitle = subj.name;

                let grpId = c.group_id;
                if (subj && !grpId) grpId = subj.group_id;

                const grp = allGroups.find(x => x.id == grpId);
                if (grp) scopeDetail = grp.name;
            } else if (c.scope_type === 'group') {
                const grp = allGroups.find(x => x.id == c.group_id);
                if (grp) convTitle = grp.name;
                scopeDetail = 'Group';
            }

            const pinIconHTML = c.is_pinned ? '<i class="ph-fill ph-push-pin" style="color:var(--color-primary);font-size:12px;margin-right:2px;"></i>' : '';
            const favIconHTML = c.is_favourite ? '<i class="ph-fill ph-star" style="color:#f59e0b;font-size:12px;margin-right:2px;"></i>' : '';

            html += `
                <div class="conversation-item${isActive ? ' active' : ''}"
                        onclick="loadConversation('${c.conversation_id}')">
                    <div class="conversation-header-row">
                        <div class="conversation-title" title="${formatEscaped(convTitle)}">
                            ${pinIconHTML}${favIconHTML}${formatEscaped(convTitle)}
                        </div>
                        <button class="conv-menu-btn" onclick="toggleConvMenu(event, '${c.conversation_id}')">
                            <i class="ph ph-dots-three-vertical"></i>
                        </button>
                        <div class="conv-dropdown" id="dropdown-${c.conversation_id}">
                            <button class="conv-dropdown-item" onclick="toggleConvPin(event, '${c.conversation_id}')">
                                <i class="ph ${c.is_pinned ? 'ph-push-pin-slash' : 'ph-push-pin'}"></i> ${c.is_pinned ? 'Unpin' : 'Pin'}
                            </button>
                            <button class="conv-dropdown-item" onclick="toggleConvFav(event, '${c.conversation_id}')">
                                <i class="ph ${c.is_favourite ? 'ph-star' : 'ph-star'}"></i> ${c.is_favourite ? 'Unfavourite' : 'Favourite'}
                            </button>
                            <button class="conv-dropdown-item" onclick="exportConv(event, '${c.conversation_id}')">
                                <i class="ph ph-download-simple"></i> Export
                            </button>
                            <button class="conv-dropdown-item danger" onclick="deleteConv(event, '${c.conversation_id}')">
                                <i class="ph ph-trash"></i> Delete
                            </button>
                        </div>
                    </div>
                    <div class="conversation-meta">
                        <span title="${formatEscaped(scopeDetail)}" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; margin-right: 5px;"><i class="ph ${icon}"></i> ${formatEscaped(scopeDetail)}</span>
                        <span style="display:flex;align-items:center;gap:5px; flex-shrink: 0;">
                            <span class="conv-msg-count"><i class="ph ph-chat-dots"></i> ${c.message_count} ${msgWord}</span>
                            <span>${dateStr}</span>
                        </span>
                    </div>
                </div>`;
        });
    }
    list.innerHTML = html;
}

async function loadConversation(convId) {
    // Mark as active in sidebar
    document.querySelectorAll('.conversation-item').forEach(el => {
        el.classList.toggle('active', el.onclick && el.getAttribute('onclick').includes(convId));
    });

    try {
        const res = await fetch(`/chat/conversations/${convId}/messages`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) { console.error('Failed to load conversation'); return; }
        const msgs = await res.json();

        currentConversationId = convId;
        isViewingHistory = true;

        // Build message list locally from history array
        const historyMessages = [];
        // First pass: add messages 
        msgs.forEach((msg, idx) => {
            historyMessages.push({
                id: msg.id, // Store database ID for reply references
                role: 'user',
                content: msg.message,
                time: new Date(msg.created_at),
                ai_mode: msg.ai_mode,
                reply_to_message_id: msg.reply_to_message_id // Temporary stored ID
            });
            historyMessages.push({
                id: msg.id + '_ai', // Pseudo ID for AI messages if needed
                role: 'ai',
                content: msg.response,
                time: new Date(msg.created_at),
                sources: msg.sources || [],
                ai_model: msg.ai_model,
                ai_mode: msg.ai_mode,
                detailed_sources: msg.detailed_sources || [],
                timings: msg.timings,
            });
        });

        // Second pass: wire up replyTo references using array index
        historyMessages.forEach((msg, idx) => {
            if (msg.role === 'user' && msg.reply_to_message_id !== null && msg.reply_to_message_id !== undefined) {
                const targetIdx = parseInt(msg.reply_to_message_id);
                if (!isNaN(targetIdx) && targetIdx >= 0 && targetIdx < historyMessages.length) {
                    msg.replyTo = {
                        id: targetIdx,
                        content: historyMessages[targetIdx].content
                    };
                }
            }
        });

        conversationMessages = historyMessages; // Restore scope from first message
        const first = msgs[0];
        let scopeType = null, scopeId = null, scopeTitle = 'Past Conversation';
        if (first.lecture_id) {
            scopeType = 'note'; scopeId = first.lecture_id;
            const l = allLectures.find(x => x.id == first.lecture_id);
            if (l) scopeTitle = `Note: ${l.title}`;
        } else if (first.subject_id) {
            scopeType = 'subject'; scopeId = first.subject_id;
            const s = allSubjects.find(x => x.id == first.subject_id);
            if (s) scopeTitle = `Subject: ${s.name}`;
        } else if (first.group_id) {
            scopeType = 'group'; scopeId = first.group_id;
            const g = allGroups.find(x => x.id == first.group_id);
            if (g) scopeTitle = `Group: ${g.name}`;
        }

        currentScope = { type: scopeType, id: scopeId, title: scopeTitle };
        saveScopeToStorage(currentScope);
        document.getElementById('contextDisplay').style.display = (scopeId ? 'flex' : 'none');
        document.getElementById('messageInput').disabled = !scopeId;
        document.getElementById('sendBtn').disabled = !scopeId;

        // Show conversation title (with hierarchy) in header
        const hierarchyTitle = buildHierarchyTitle(scopeType, scopeId);
        const breadcrumb = buildHierarchyBreadcrumb(scopeType, scopeId);
        document.getElementById('chatTitle').textContent = hierarchyTitle;
        document.getElementById('chatSubtitle').textContent = breadcrumb || 'Ask questions about your notes, subjects, or groups';
        document.getElementById('chatMeta').textContent =
            `${msgs.length} question(s)  |  Started ${formatMessageDate(parseUTCDate(first.created_at))}`;
        document.getElementById('chatMeta').style.display = 'block';

        displayMessages();
    } catch (e) {
        console.error('loadConversation error', e);
    }
}

// ── Utility ───────────────────────────────────────────────────────
function formatEscaped(str) {
    return (str || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function parseUTCDate(dateString) {
    // Backend sends naive UTC strings without 'Z' suffix
    // Treat them as UTC by appending 'Z' if not present
    if (typeof dateString === 'string' && !dateString.endsWith('Z')) {
        dateString = dateString + 'Z';
    }
    return new Date(dateString);
}

function convertSnippetReferencesToWikipediaStyle(content) {
    // Look for bracketed text (potential snippet references)
    // Pattern: [ arbitrary text with or without quotes ]
    const bracketPattern = /\[([^\]]*)\]/g;
    const references = [];
    const matches = [];

    // Find all bracketed content
    let match;
    while ((match = bracketPattern.exec(content)) !== null) {
        const bracketedText = match[1].trim();
        // Only treat as reference if it's substantial text (not just numbers)
        if (bracketedText.length > 3 && !/^\d+$/.test(bracketedText)) {
            matches.push({ full: match[0], text: bracketedText, index: match.index });
        }
    }

    // Replace all bracketed snippets with superscript numbers
    let convertedContent = content;
    let offset = 0;
    matches.forEach((match, idx) => {
        const refNum = idx + 1;
        const replacement = `<span class="reference-link">[${refNum}]</span>`;
        const startPos = match.index + offset;
        const endPos = startPos + match.full.length;
        convertedContent = convertedContent.substring(0, startPos) + replacement + convertedContent.substring(endPos);
        offset += replacement.length - match.full.length;

        // Clean up the text for display
        let refText = match.text.replace(/^"|"$/g, '').replace(/\.\.\.$/, '').trim();
        if (refText.length > 80) refText = refText.substring(0, 80) + '...';
        references.push({ num: refNum, text: refText });
    });

    // Build references section if any found
    let referencesHTML = '';
    if (references.length > 0) {
        referencesHTML = `
            <div class="references-section">
                <div class="references-section-title">References</div>
                ${references.map(ref => `
                    <div class="reference-item">
                        <span class="reference-item-number">[${ref.num}]</span>
                        <span class="reference-item-text">${ref.text}</span>
                    </div>
                `).join('')}
            </div>`;
    }

    return { content: convertedContent, referencesHTML };
}

function formatMessageTime(date) {
    if (!(date instanceof Date)) {
        date = new Date(date);
    }

    // Use device's native local timezone (don't specify timeZone)
    const timeStr = date.toLocaleString([], {
        hour: '2-digit',
        minute: '2-digit'
    });

    return timeStr;
}

function formatMessageDate(date, options = {}) {
    if (!(date instanceof Date)) {
        date = new Date(date);
    }

    const defaultOptions = {
        month: 'short',
        day: 'numeric'
    };

    const finalOptions = { ...defaultOptions, ...options };
    const dateStr = date.toLocaleDateString([], finalOptions);

    return dateStr;
}

function formatMessageDateAndTime(date) {
    if (!(date instanceof Date)) {
        date = new Date(date);
    }

    // Use device's native local timezone
    const dateStr = date.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    return dateStr;
}

function getDateInTimezone(date) {
    if (!(date instanceof Date)) {
        date = new Date(date);
    }
    // Get midnight of the date in device's local timezone
    const localDateStr = date.toLocaleDateString('en-CA');
    return new Date(localDateStr + 'T00:00:00');
}

function openSourceReference(lectureId, position) {
    if (!lectureId) { alert('Source reference not available'); return; }
    window.open(`/note/${lectureId}#pos-${position}`, '_blank');
}

function toggleMetadata(sectionId, msgId, event) {
    if (event) event.stopPropagation();
    const content = document.getElementById(sectionId + '-content');
    if (!content) return;
    const isExpanded = content.classList.contains('expanded');
    if (!isExpanded) {
        const other = sectionId.includes('-ref') ? msgId + '-info' : msgId + '-ref';
        const otherEl = document.getElementById(other + '-content');
        if (otherEl) otherEl.classList.remove('expanded');
    }
    content.classList.toggle('expanded');
}

// ── Conversation Actions ──────────────────────────────────────────
function toggleConvMenu(e, convId) {
    e.stopPropagation();
    const dropdown = document.getElementById('dropdown-' + convId);
    const isShowing = dropdown.classList.contains('show');

    // Close all others
    document.querySelectorAll('.conv-dropdown.show').forEach(el => el.classList.remove('show'));

    if (!isShowing) dropdown.classList.add('show');
}

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.conv-dropdown') && !e.target.closest('.conv-menu-btn')) {
        document.querySelectorAll('.conv-dropdown.show').forEach(el => el.classList.remove('show'));
    }
});

async function toggleConvPin(e, convId) {
    e.stopPropagation();
    try {
        await fetch(`/chat/conversations/${convId}/pin`, { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` } });
        await fetchConversations();
    } catch (err) { console.error(err); }
}

async function toggleConvFav(e, convId) {
    e.stopPropagation();
    try {
        await fetch(`/chat/conversations/${convId}/favourite`, { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` } });
        await fetchConversations();
    } catch (err) { console.error(err); }
}

async function deleteConv(e, convId) {
    e.stopPropagation();
    showDeleteConfirmModal(() => {
        performDeleteConv(convId);
    });
}

async function performDeleteConv(convId) {
    try {
        await fetch(`/chat/conversations/${convId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
        if (currentConversationId === convId) createNewChat();
        await fetchConversations();
    } catch (err) { console.error(err); }
}

function showDeleteConfirmModal(onConfirm) {
    let modal = document.getElementById('deleteConfirmModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'deleteConfirmModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="min-height: auto;">
                <h3>Delete Conversation?</h3>
                <p style="margin-bottom: var(--spacing-lg); color: var(--color-gray);">Are you sure you want to delete this entire conversation? This action cannot be undone.</p>
                <div class="modal-buttons">
                    <button type="button" class="btn-save" style="background: var(--color-error);" onmouseover="this.style.background='#c0392b'" onmouseout="this.style.background='var(--color-error)'" onclick="confirmDeleteConv()">Delete</button>
                    <button type="button" class="btn-cancel" onclick="cancelDeleteConv()">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    modal.classList.add('active');
    window._deleteConfirmCallback = onConfirm;
}

window.confirmDeleteConv = function () {
    const modal = document.getElementById('deleteConfirmModal');
    if (modal) modal.classList.remove('active');
    if (window._deleteConfirmCallback) window._deleteConfirmCallback();
};

window.cancelDeleteConv = function () {
    const modal = document.getElementById('deleteConfirmModal');
    if (modal) modal.classList.remove('active');
};

async function exportConv(e, convId) {
    e.stopPropagation();
    try {
        const res = await fetch(`/chat/conversations/${convId}/messages`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) return;
        const msgs = await res.json();

        let text = `# ${msgs[0].conversation_title || 'Chat Export'}\n\n`;
        msgs.forEach(m => {
            text += `**User:**\n${m.message}\n\n**AI:**\n${m.response}\n\n---\n\n`;
        });

        const blob = new Blob([text], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat-export-${convId.substring(0, 8)}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) { console.error(err); }
}

// ── Citation Parsing & Rendering ──────────────────────────────────
function parseCitations(text) {
    /**
     * Parse text with [1], [2], etc. citations and convert them to clickable links.
     * Returns HTML with citations as clickable spans.
     */
    // Pattern to match [1], [2], etc.
    const citationPattern = /\[(\d+)\]/g;
    let converted = text;

    converted = converted.replace(citationPattern, (match, num) => {
        return `<span class="citation-link" data-citation-num="${num}" onclick="handleCitationClick(event, ${num})">[${num}]</span>`;
    });

    return converted;
}

function handleCitationClick(event, citationNum) {
    event.preventDefault();
    event.stopPropagation();

    // Find the corresponding source item in the same message
    const messageContent = event.target.closest('.message-content');
    if (!messageContent) return;

    const message = messageContent.closest('.message');
    if (!message) return;

    // Find all source items in this message's metadata
    const sourceItems = message.querySelectorAll('.source-item');
    if (citationNum > 0 && citationNum <= sourceItems.length) {
        const targetSource = sourceItems[citationNum - 1];

        // Trigger the source item's onclick behavior
        // Check if it's a web source or note source by examining the onclick or data attributes
        const onclickAttr = targetSource.getAttribute('onclick');
        if (onclickAttr) {
            // Execute the onclick handler
            eval(onclickAttr);
        } else {
            // Fallback: scroll to highlight
            highlightCitation(event, citationNum);
        }
    }
}

function highlightCitation(event, citationNum) {
    event.preventDefault();
    event.stopPropagation();

    // Remove previous highlights
    document.querySelectorAll('.citation-link.highlighted, .source-item.highlighted-source').forEach(el => {
        el.classList.remove('highlighted', 'highlighted-source');
    });

    // Highlight the clicked citation
    const clickedCitation = event.target;
    if (clickedCitation.classList.contains('citation-link')) {
        clickedCitation.classList.add('highlighted');
    }

    // Find and highlight the corresponding source (nth-child starts at 1)
    const sourceItems = document.querySelectorAll('.source-item');
    if (citationNum > 0 && citationNum <= sourceItems.length) {
        const targetSource = sourceItems[citationNum - 1];
        targetSource.classList.add('highlighted-source');

        // Scroll the source into view
        targetSource.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

if (typeof marked === 'undefined') {
    document.write('<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>');
}
// Configure marked to enable tables and other features
if (typeof marked !== 'undefined') {
    marked.setOptions({
        breaks: true,
        gfm: true
    });
}