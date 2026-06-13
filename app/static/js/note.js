let noteId = null;
let noteData = null;
let pollingInterval = null;
let isEditing = false;

// ===== INLINE CHAT STATE =====
let chatMessages = [];
let chatConversationId = null;
let chatAiMode = localStorage.getItem('globalAiMode') || 'normal';
let chatOutputFormat = localStorage.getItem('globalOutputFormat') || 'sentence';
window.replyingToMessageId = null;
window.replyingToMessageContent = null;

const NOTE_MODE_META = {
    quick: { label: 'Quick', icon: 'ph-lightning' },
    simple: { label: 'Simple', icon: 'ph-text-a-underline' },
    normal: { label: 'Normal', icon: 'ph-stack' },
    elaborate: { label: 'Elaborate', icon: 'ph-lightbulb' },
    eli5: { label: 'ELI5', icon: 'ph-smiley' },
};

const NOTE_OUTPUT_FORMAT_META = {
    sentence: { label: 'Sentence', icon: 'ph-text-t' },
    pointform: { label: 'Pointform', icon: 'ph-list-bullets' },
    numbered_list: { label: 'Numbered List', icon: 'ph-list-numbers' },
    table: { label: 'Table', icon: 'ph-table' },
};

function generateUUID() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}


// ===== CONTRAST COLOR UTILITY =====
function getContrastColor(hexColor) {
    if (!hexColor || hexColor.length < 7) return '#ffffff';
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    // Relative luminance (WCAG formula)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#1a1a1a' : '#ffffff';
}

// ===== HASH NAVIGATION (cross-compatible with chat references) =====
async function navigateToReferencePosition(position) {
    "use strict";
    // Wait for content to render
    const maxTries = 50;
    for (let i = 0; i < maxTries; i++) {
        if (document.getElementById('extractedText')?.children.length > 0) {
            setTimeout(() => scrollToPosition(position), 100);
            return;
        }
        await new Promise(r => setTimeout(r, 100));
    }
}

function scrollToPosition(position) {
    "use strict";
    const container = document.getElementById('extractedText');
    if (!container) return;

    // Get all text nodes from the container
    const textNodes = [];
    let charCount = 0;

    function collectTextNodes(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            if (node.textContent.trim().length > 0) {
                textNodes.push({
                    node: node,
                    start: charCount,
                    end: charCount + node.textContent.length,
                    element: node.parentElement
                });
                charCount += node.textContent.length;
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            for (let child of node.childNodes) {
                collectTextNodes(child);
            }
        }
    }

    collectTextNodes(container);

    // Find the text node containing the target position
    let foundElement = null;
    for (let textNodeInfo of textNodes) {
        if (position >= textNodeInfo.start && position <= textNodeInfo.end) {
            foundElement = textNodeInfo.element;
            break;
        }
    }

    if (foundElement) {
        // Highlight the element
        foundElement.classList.add('reference-highlight');
        foundElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Remove highlight after 3 seconds
        setTimeout(() => {
            foundElement.classList.remove('reference-highlight');
        }, 3000);
    }
}

// ===== INIT =====
window.addEventListener('load', () => {
    // Extract UUID or integer ID from path /note/123
    const pathParts = window.location.pathname.split('/');
    noteId = pathParts[pathParts.length - 1];

    if (!noteId || noteId === 'note') {
        showError('No note ID provided in URL path');
        return;
    }
    loadNote();

    // Handle reference navigation from chat (hash-based)
    const hash = window.location.hash;
    if (hash.startsWith('#pos-')) {
        const position = parseInt(hash.substring(5), 10);
        if (!isNaN(position)) {
            navigateToReferencePosition(position);
        }
    }
});

// ===== LOAD NOTE =====
async function loadNote() {
    try {
        const response = await fetch(`/notes/${noteId}`);
        if (!response.ok) throw new Error('Failed to load note');
        noteData = await response.json();
        displayNote();
        checkExtractionStatus();
        loadSnapshots();
    } catch (error) {
        showError(error.message);
    }
}

// ===== DISPLAY NOTE =====
function displayNote() {
    document.getElementById('loadingContainer').style.display = 'none';
    document.getElementById('noteContainer').style.display = 'block';
    document.querySelector('.note-action-panel').style.display = '';

    // Note title will be extracted from first h1 in markdown, no longer set here

    // Subject color dot
    const subjectColor = noteData.subject?.color || '#593C8F';
    const dot = document.getElementById('subjectDot');
    if (dot) dot.style.background = subjectColor;

    // Metadata
    const subjectName = noteData.subject?.name || 'Unknown Subject';
    const subjectId = noteData.subject_id;
    const metaSubject = document.getElementById('metaSubject');
    if (metaSubject) {
        metaSubject.textContent = subjectName;
        metaSubject.href = subjectId ? `/subject.html?id=${subjectId}` : '#';
    }

    const metaNote = document.getElementById('metaNote');
    if (metaNote) {
        metaNote.textContent = noteData.title;
        metaNote.href = `/note/${noteId}`;
    }

    // Fetch group name
    if (noteData.subject?.group_id) {
        fetchGroupName(noteData.subject.group_id);
    } else {
        const mg = document.getElementById('metaGroup');
        if (mg) mg.textContent = 'Ungrouped';
    }



    // Sidebar info
    document.getElementById('fileName').textContent = noteData.file_name || '-';
    const uploadDate = new Date(noteData.created_at);
    document.getElementById('uploadedDate').textContent = window.formatDate(noteData.created_at);

    const fileType = noteData.file_type || '';
    if (fileType.includes('pdf')) document.getElementById('fileType').textContent = 'PDF';
    else if (fileType.includes('presentation') || fileType.includes('powerpoint')) document.getElementById('fileType').textContent = 'PPTX';
    else if (fileType.includes('image')) document.getElementById('fileType').textContent = 'Image';
    else document.getElementById('fileType').textContent = fileType.split('/').pop()?.toUpperCase() || 'File';

    document.getElementById('fileSize').textContent = formatFileSize(noteData.file_size);

    // Processing time
    if (noteData.processing_time_ms !== null && noteData.processing_time_ms !== undefined) {
        const diffMs = noteData.processing_time_ms;
        if (diffMs < 1000) {
            document.getElementById('processingTime').textContent = `${diffMs}ms`;
        } else {
            const totalSecs = Math.floor(diffMs / 1000);
            if (totalSecs > 3600) {
                document.getElementById('processingTime').textContent = 'N/A';
            } else {
                document.getElementById('processingTime').textContent = totalSecs > 60 ?
                    `${Math.floor(totalSecs / 60)}m ${totalSecs % 60}s` : `${totalSecs}s`;
            }
        }
    } else {
        document.getElementById('processingTime').textContent = 'N/A';
    }

    document.title = noteData.title + ' - MySmartNotes';
    updateExtractedText();
}

async function fetchGroupName(groupId) {
    try {
        const res = await fetch('/groups');
        if (res.ok) {
            const groups = await res.json();
            const group = groups.find(g => g.id == groupId);
            const metaGroup = document.getElementById('metaGroup');
            if (metaGroup) {
                if (group) {
                    metaGroup.textContent = group.name;
                    metaGroup.href = `/group.html?id=${group.id}`;
                } else {
                    metaGroup.textContent = 'Unknown Group';
                }
            }
        }
    } catch (e) { console.error('Error fetching group:', e); }
}

function formatFileSize(bytes) {
    if (!bytes) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
}

// ===== EXTRACTED TEXT & H1 SYNCING =====
function updateExtractedText() {
    const textContainer = document.getElementById('extractedText');
    textContainer.innerHTML = '';
    document.getElementById('progressContainer').style.display = 'none';
    document.getElementById('errorContainerInline').style.display = 'none';
    
    // Always hide extractionStatus initially, we'll show it only if needed (e.g. failed)
    const extractionStatus = document.getElementById('extractionStatus');
    if (extractionStatus) extractionStatus.style.display = 'none';

    if (noteData.extracted_text) {
        // ... (rest of function unchanged)
        // Remove loading bar if present
        const bar = document.getElementById('noteLoadingBar');
        if (bar) bar.remove();

        try {
            textContainer.innerHTML = marked.parse(noteData.extracted_text);
            if (pollingInterval) clearInterval(pollingInterval);
            setupH1Editing();
            setupStickyHeaderFading();
            return;
        } catch (e) {
            console.error('marked.js failed:', e);
        }
    } else {
        // Show skeleton loading if still processing
        const taskId = `ocr_${noteData.user_id}_${noteData.id}`;
        const activeTasks = window.ProgressManager ? window.ProgressManager.activeTasks : new Map();
        const activeTask = activeTasks.get(taskId);
        
        if (activeTask && (activeTask.status === 'processing' || activeTask.status === 'pending' || activeTask.status === 'running')) {
            textContainer.innerHTML = `
                <div class="skeleton-container">
                    <div class="skeleton-line" style="width: 80%; height: 32px; margin-bottom: 24px;"></div>
                    <div class="skeleton-line" style="width: 100%;"></div>
                    <div class="skeleton-line" style="width: 95%;"></div>
                    <div class="skeleton-line" style="width: 90%;"></div>
                    <div class="skeleton-line" style="width: 85%; margin-bottom: 12px;"></div>
                    <div class="skeleton-line" style="width: 100%;"></div>
                    <div class="skeleton-line" style="width: 98%;"></div>
                    <div class="skeleton-line" style="width: 92%;"></div>
                    <div class="skeleton-line" style="width: 40%;"></div>
                </div>
            `;
            
            // Add fixed bottom progress bar if not present
            if (!document.getElementById('noteLoadingBar')) {
                const bar = document.createElement('div');
                bar.id = 'noteLoadingBar';
                bar.className = 'loading-bar-fixed-bottom';
                bar.innerHTML = '<div class="loading-bar-fill" id="noteLoadingBarFill"></div>';
                document.body.appendChild(bar);
            }
            const fill = document.getElementById('noteLoadingBarFill');
            if (fill) fill.style.width = activeTask.progress + '%';
            
            // Exit early so we don't show "No content found"
            return;
        } else {
            textContainer.innerHTML = '<div class="empty-state">No content found.</div>';
        }
    }
}

// Listen for task updates to refresh the note content in real-time
window.addEventListener('taskUpdate', (e) => {
    const task = e.detail;
    if (task.task_id === `ocr_${noteData.user_id}_${noteId}`) {
        const fill = document.getElementById('noteLoadingBarFill');
        if (fill) fill.style.width = task.progress + '%';

        if (task.status === 'completed') {
            loadNote();
        } else if (task.status === 'failed') {
            const bar = document.getElementById('noteLoadingBar');
            if (bar) bar.remove();
            const textContainer = document.getElementById('extractedText');
            if (textContainer) textContainer.innerHTML = '<div class="empty-state">Processing failed.</div>';
        }
    }
});

// Extract first h1 and make it editable
function setupH1Editing() {
    const firstH1 = document.querySelector('.markdown-content h1');
    if (firstH1) {
        // Make the h1 editable
        firstH1.contentEditable = 'true';
        firstH1.style.cursor = 'text';

        // Add visual feedback on focus
        firstH1.addEventListener('focus', function () {
            firstH1.style.outline = '2px solid var(--color-primary)';
            firstH1.style.outlineOffset = '4px';
        });

        firstH1.addEventListener('blur', function () {
            firstH1.style.outline = 'none';
            const newTitle = firstH1.textContent.trim();
            if (newTitle && newTitle !== noteData.title) {
                updateNoteTitle(newTitle);
            }
        });

        // Update title on keyboard shortcuts (Ctrl+S or Cmd+S)
        firstH1.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                firstH1.blur();
            }
        });

        // Prevent drag and other default contenteditable behaviors
        firstH1.addEventListener('paste', function (e) {
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            document.execCommand('insertText', false, text);
        });
    }
}

// Update note title in the database
async function updateNoteTitle(newTitle) {
    try {
        const response = await fetch(`/notes/${noteId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title: newTitle })
        });
        if (response.ok) {
            noteData.title = newTitle;
            document.title = newTitle + ' - MySmartNotes';
        } else {
            console.error('Failed to update note title');
            // Revert the change
            const firstH1 = document.querySelector('.markdown-content h1');
            if (firstH1) firstH1.textContent = noteData.title;
        }
    } catch (e) {
        console.error('Error updating note title:', e);
        // Revert the change
        const firstH1 = document.querySelector('.markdown-content h1');
        if (firstH1) firstH1.textContent = noteData.title;
    }
}

// ===== DYNAMIC HEADER FADING =====
let stickyScrollListenerAttached = false;
function setupStickyHeaderFading() {
    const contentCard = document.querySelector('.note-content-card');
    if (!contentCard) return;

    function handleScroll() {
        const h1s = document.querySelectorAll('.markdown-content h1');
        const h2s = document.querySelectorAll('.markdown-content h2');
        const h3s = document.querySelectorAll('.markdown-content h3');

        // Reset all color properties
        h1s.forEach(h => { h.style.transition = 'color 0.2s'; h.style.color = '#1a1a1a'; });
        h2s.forEach(h => { h.style.transition = 'color 0.2s'; h.style.color = '#333'; });
        h3s.forEach(h => { h.style.transition = 'color 0.2s'; h.style.color = '#555'; });

        // Define sticky thresholds (must match style.css tops + minor buffer of 2px for precision)
        const h1Offset = 36;
        const h2Offset = 81;
        const h3Offset = 121;

        const cardRect = contentCard.getBoundingClientRect();

        const getStuckHeader = (headers, stickyTop) => {
            return Array.from(headers).reverse().find(h => {
                const rect = h.getBoundingClientRect();
                return (rect.top - cardRect.top) <= stickyTop;
            });
        };

        const stuckH1 = getStuckHeader(h1s, h1Offset);
        const stuckH2 = getStuckHeader(h2s, h2Offset);
        const stuckH3 = getStuckHeader(h3s, h3Offset);

        // Apply opacity logic
        if (stuckH3) {
            if (stuckH1) { stuckH1.style.color = '#ccc'; }
            if (stuckH2) { stuckH2.style.color = '#999'; }
        } else if (stuckH2) {
            if (stuckH1) { stuckH1.style.color = '#ccc'; }
        }
    }

    if (!stickyScrollListenerAttached) {
        contentCard.addEventListener('scroll', handleScroll, { passive: true });
        stickyScrollListenerAttached = true;
    }
    // Trigger immediately to evaluate initial load view correctly
    handleScroll();
}

// ===== EXTRACTION STATUS =====
async function checkExtractionStatus() {
    if (noteData.extracted_text) return;
    try {
        const response = await fetch(`/search/task?note_id=${noteId}`);
        if (response.ok) {
            const task = await response.json();
            document.getElementById('extractionStatus').style.display = 'block';
            if (task.status === 'pending') { showPending(); startPolling(); }
            else if (task.status === 'running') { showRunning(); startPolling(); }
            else if (task.status === 'completed') { reloadNote(); }
            else if (task.status === 'failed') { showFailed(); }
        }
    } catch (error) { console.error('Error checking task status:', error); }
}

function showPending() {
    document.getElementById('progressContainer').style.display = 'block';
    document.getElementById('statusBadge').textContent = 'Pending';
    document.getElementById('statusBadge').className = 'status-badge status-pending';
    document.getElementById('progressPercent').textContent = '5%';
    document.getElementById('progressFill').style.width = '5%';
    document.getElementById('progressMessage').textContent = 'Waiting to process...';
}

function showRunning() {
    document.getElementById('progressContainer').style.display = 'block';
    document.getElementById('statusBadge').textContent = 'Processing';
    document.getElementById('statusBadge').className = 'status-badge status-running';
    document.getElementById('progressPercent').textContent = '50%';
    document.getElementById('progressFill').style.width = '50%';
    document.getElementById('progressMessage').textContent = 'Extracting text from document...';
}

function showFailed() {
    document.getElementById('progressContainer').style.display = 'none';
    document.getElementById('errorContainerInline').style.display = 'block';
    document.getElementById('statusBadge').textContent = 'Failed';
    document.getElementById('statusBadge').className = 'status-badge status-failed';
    if (pollingInterval) clearInterval(pollingInterval);
}

function startPolling() { pollingInterval = setInterval(pollStatus, 2000); }

async function pollStatus() {
    try {
        const response = await fetch(`/search/task?note_id=${noteId}`);
        if (response.ok) {
            const task = await response.json();
            if (task.status === 'completed') { clearInterval(pollingInterval); reloadNote(); }
            else if (task.status === 'failed') { clearInterval(pollingInterval); showFailed(); }
        }
    } catch (error) { console.error('Error polling:', error); }
}

async function reloadNote() {
    try {
        const response = await fetch(`/notes/${noteId}`);
        if (response.ok) {
            noteData = await response.json();
            updateExtractedText();
            document.getElementById('progressContainer').style.display = 'none';
            document.getElementById('errorContainerInline').style.display = 'none';
            document.getElementById('extractionStatus').style.display = 'none';
        }
    } catch (error) { console.error('Error reloading:', error); }
}

// ===== WYSIWYG EDITOR =====
let showingSource = false;

function toggleEdit() {
    if (isEditing) {
        cancelEdit();
    } else {
        isEditing = true;
        const editorContainer = document.getElementById('editorContainer');
        const viewContainer = document.getElementById('viewContainer');

        viewContainer.style.display = 'none';
        editorContainer.style.display = 'flex';
        editorContainer.classList.add('active');

        // Update URL without reloading
        if (!window.location.pathname.endsWith('/edit')) {
            history.pushState(null, '', `/note/${noteId}/edit`);
        }

        const area = document.getElementById('wysiwygArea');
        const md = noteData.extracted_text || '';
        try {
            area.innerHTML = marked.parse(md);
        } catch (e) {
            area.innerHTML = md.replace(/\n/g, '<br>');
        }
        area.focus();
        showingSource = false;
        document.getElementById('sourceToggle').classList.remove('active');
    }
}

function cancelEdit() {
    isEditing = false;
    const editorContainer = document.getElementById('editorContainer');
    const viewContainer = document.getElementById('viewContainer');

    editorContainer.style.display = 'none';
    editorContainer.classList.remove('active');
    viewContainer.style.display = 'block';

    // Revert URL
    history.pushState(null, '', `/note/${noteId}`);
}

function viewNote() {
    if (isEditing) {
        cancelEdit();
    } else {
        window.location.href = `/note/${noteId}`;
    }
}

// Execute formatting command on the WYSIWYG area
function execCmd(command, value) {
    const area = document.getElementById('wysiwygArea');
    if (document.activeElement !== area) area.focus();

    if (command === 'formatBlock' && value && value.match(/^H[1-3]$/)) {
        if (globalCurrentTable) return;
    }

    if (command === 'formatBlock') {
        document.execCommand('formatBlock', false, '<' + value + '>');
    } else {
        document.execCommand(command, false, value || null);
    }
    updateToolbarState();
}

function toggleBlockquote() {
    const area = document.getElementById('wysiwygArea');
    if (document.activeElement !== area) area.focus();

    const sel = window.getSelection();
    let inBlockquote = false;

    if (sel && sel.rangeCount > 0) {
        let node = sel.focusNode;
        while (node && node !== area) {
            if (node.nodeType === 1 && node.tagName === 'BLOCKQUOTE') {
                inBlockquote = true;
                break;
            }
            node = node.parentNode;
        }
    }

    if (inBlockquote) {
        document.execCommand('outdent');
    } else {
        document.execCommand('formatBlock', false, '<BLOCKQUOTE>');
    }
    updateToolbarState();
}

// Modals
function showSaveModal() {
    document.getElementById('saveConfirmModal').classList.add('active');
}

function closeSaveModal() {
    document.getElementById('saveConfirmModal').classList.remove('active');
}

function confirmSave() {
    closeSaveModal();
    saveContent();
}

function showDiscardModal() {
    document.getElementById('discardConfirmModal').classList.add('active');
}

function closeDiscardModal() {
    document.getElementById('discardConfirmModal').classList.remove('active');
}

function confirmDiscard() {
    closeDiscardModal();
    cancelEdit();
}

function insertTableWysiwyg() {
    const area = document.getElementById('wysiwygArea');
    area.focus();
    const html = '<table><thead><tr><th>Header 1</th><th>Header 2</th><th>Header 3</th></tr></thead><tbody><tr><td>Cell 1</td><td>Cell 2</td><td>Cell 3</td></tr><tr><td>Cell 4</td><td>Cell 5</td><td>Cell 6</td></tr></tbody></table><p><br></p>';
    document.execCommand('insertHTML', false, html);
}

function insertCodeBlock() {
    const area = document.getElementById('wysiwygArea');
    area.focus();
    const html = '<pre><code>// your code here</code></pre><p><br></p>';
    document.execCommand('insertHTML', false, html);
}

// Globals for table context
let globalCurrentTableCell = null;
let globalCurrentTable = null;
let currentSelectedCells = [];
let isTableSelecting = false;
let startTableCell = null;
let isMouseDownInTable = false;
let isResizing = false;
let resizeType = null;
let resizeTarget = null;
let startX = 0, startY = 0, startWidth = 0, startHeight = 0;
let hoverResizeType = null;
let hoverResizeTarget = null;

function clearCellSelection() {
    document.querySelectorAll('.active-table-cell').forEach(c => c.classList.remove('active-table-cell'));
    currentSelectedCells = [];
}

document.addEventListener('DOMContentLoaded', () => {
    const editorBody = document.getElementById('editorBody');
    if (!editorBody) return;

    editorBody.addEventListener('mousemove', (e) => {
        if (!isEditing || showingSource) return;

        if (isResizing) {
            if (resizeType === 'col') {
                const newWidth = startWidth + (e.pageX - startX);
                if (newWidth > 20) resizeTarget.style.width = newWidth + 'px';
            } else if (resizeType === 'row') {
                const newHeight = startHeight + (e.pageY - startY);
                if (newHeight > 20) resizeTarget.style.height = newHeight + 'px';
            }

            document.getElementById('tableContextMenu').classList.remove('visible');
            const editorRect = editorBody.parentElement.getBoundingClientRect();
            const targetRect = resizeTarget.getBoundingClientRect();

            if (resizeType === 'col') {
                const colHandle = document.getElementById('colAddHandle');
                if (colHandle) colHandle.style.left = (targetRect.right - editorRect.left + 2) + 'px';
            } else if (resizeType === 'row') {
                const rowHandle = document.getElementById('rowAddHandle');
                if (rowHandle) rowHandle.style.top = (targetRect.bottom - editorRect.top + 2) + 'px';
            }

            e.preventDefault();
            return;
        }

        if (!isMouseDownInTable && e.target.closest) {
            const td = e.target.closest('td, th');
            if (td) {
                const rect = td.getBoundingClientRect();
                const x = e.clientX;
                const y = e.clientY;

                const nearRight = (rect.right - x) < 12 && (rect.right - x) >= -6;
                const nearBottom = (rect.bottom - y) < 12 && (rect.bottom - y) >= -6;

                if (nearRight) {
                    editorBody.style.cursor = 'col-resize';
                    hoverResizeType = 'col';
                    hoverResizeTarget = td;
                } else if (nearBottom) {
                    editorBody.style.cursor = 'row-resize';
                    hoverResizeType = 'row';
                    hoverResizeTarget = td;
                } else {
                    editorBody.style.cursor = '';
                    hoverResizeType = null;
                    hoverResizeTarget = null;
                }
            } else {
                editorBody.style.cursor = '';
                hoverResizeType = null;
                hoverResizeTarget = null;
            }
        }
    });

    editorBody.addEventListener('mousedown', (e) => {
        if (!isEditing || showingSource) return;

        if (hoverResizeType && hoverResizeTarget) {
            isResizing = true;
            resizeType = hoverResizeType;
            resizeTarget = hoverResizeTarget;
            startX = e.pageX;
            startY = e.pageY;
            startWidth = resizeTarget.offsetWidth;
            startHeight = resizeTarget.offsetHeight;
            e.preventDefault();
            return;
        }

        const td = e.target.closest('td, th');
        if (td) {
            isMouseDownInTable = true;
            if (e.shiftKey && startTableCell && startTableCell.closest('table') === td.closest('table')) {
                e.preventDefault();
                isTableSelecting = true;
                selectCellsBetween(startTableCell, td);
            } else {
                startTableCell = td;
                isTableSelecting = false;
                if (!td.classList.contains('active-table-cell') || currentSelectedCells.length > 1) {
                    clearCellSelection();
                    td.classList.add('active-table-cell');
                    currentSelectedCells = [td];
                    setTimeout(updateToolbarState, 10);
                }
            }
        } else {
            startTableCell = null;
            clearCellSelection();
            setTimeout(updateToolbarState, 10);
        }
    });

    editorBody.addEventListener('mouseover', (e) => {
        if (isMouseDownInTable && startTableCell) {
            const td = e.target.closest('td, th');
            if (td && td !== startTableCell && startTableCell.closest('table') === td.closest('table')) {
                isTableSelecting = true;
                selectCellsBetween(startTableCell, td);
                window.getSelection().removeAllRanges();
            }
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            editorBody.style.cursor = '';
            resizeTarget = null;
            setTimeout(updateToolbarState, 10);
        }
        isMouseDownInTable = false;
        isTableSelecting = false;
    });

    // Auto open editor if URL path ends with /edit
    if (window.location.pathname.endsWith('/edit')) {
        // Polling wait until noteData is loaded to open edit view
        const checkAndEdit = setInterval(() => {
            if (noteData) {
                clearInterval(checkAndEdit);
                toggleEdit();
            }
        }, 100);
    }
});

function selectCellsBetween(startCell, endCell) {
    clearCellSelection();
    const table = startCell.closest('table');
    if (!table) return;

    const rows = Array.from(table.rows);
    let startRowIndex = -1, startColIndex = -1, endRowIndex = -1, endColIndex = -1;

    const startTr = startCell.closest('tr');
    const endTr = endCell.closest('tr');
    if (startTr && endTr) {
        startRowIndex = startTr.rowIndex;
        endRowIndex = endTr.rowIndex;
        startColIndex = Array.from(startTr.children).indexOf(startCell);
        endColIndex = Array.from(endTr.children).indexOf(endCell);
    }
    if (startRowIndex === -1 || endRowIndex === -1) return;

    const minRow = Math.min(startRowIndex, endRowIndex);
    const maxRow = Math.max(startRowIndex, endRowIndex);
    const minCol = Math.min(startColIndex, endColIndex);
    const maxCol = Math.max(startColIndex, endColIndex);

    for (let i = minRow; i <= maxRow; i++) {
        const row = rows[i];
        if (!row) continue;
        for (let j = minCol; j <= maxCol; j++) {
            const cell = row.children[j];
            if (cell) {
                cell.classList.add('active-table-cell');
                currentSelectedCells.push(cell);
            }
        }
    }
    setTimeout(updateToolbarState, 10);
}

function updateToolbarState() {
    const sel = window.getSelection();
    let currentHeading = null;
    let hasBoldTag = false;
    let inBlockquote = false;
    let currentTableCellNode = null;
    let currentTableNode = null;

    if (currentSelectedCells.length > 0) {
        currentTableCellNode = currentSelectedCells[0];
        currentTableNode = currentTableCellNode.closest('table');
    }

    if (sel && sel.rangeCount > 0) {
        let node = sel.focusNode;
        while (node && node !== document.getElementById('wysiwygArea')) {
            if (node && node.nodeType === 1) {
                if (/^H[1-6]$/i.test(node.tagName)) currentHeading = node.tagName.toUpperCase();
                if (node.tagName === 'B' || node.tagName === 'STRONG') hasBoldTag = true;
                if (node.tagName === 'BLOCKQUOTE') inBlockquote = true;
                if (node.tagName === 'TD' || node.tagName === 'TH') {
                    if (currentSelectedCells.length <= 1) currentTableCellNode = node;
                }
                if (node.tagName === 'TABLE') {
                    if (currentSelectedCells.length <= 1) currentTableNode = node;
                }
            }
            node = node.parentNode;
        }
    }

    globalCurrentTableCell = currentTableCellNode;
    globalCurrentTable = currentTableNode;
    const menu = document.getElementById('tableContextMenu');
    const colHandle = document.getElementById('colAddHandle');
    const rowHandle = document.getElementById('rowAddHandle');

    if (currentTableNode && currentTableCellNode && !showingSource) {
        if (currentSelectedCells.length <= 1) {
            clearCellSelection();
            currentTableCellNode.classList.add('active-table-cell');
            currentSelectedCells = [currentTableCellNode];
        }

        const editorRect = document.getElementById('editorContainer').getBoundingClientRect();
        let minTop = Infinity, minLeft = Infinity, maxBottom = -Infinity, maxRight = -Infinity;

        currentSelectedCells.forEach(c => {
            const r = c.getBoundingClientRect();
            if (r.top < minTop) minTop = r.top;
            if (r.left < minLeft) minLeft = r.left;
            if (r.bottom > maxBottom) maxBottom = r.bottom;
            if (r.right > maxRight) maxRight = r.right;
        });

        menu.style.top = Math.max(0, (minTop - editorRect.top - 45)) + 'px';
        menu.style.left = (minLeft - editorRect.left) + 'px';
        menu.classList.add('visible');

        if (colHandle) {
            colHandle.style.top = Math.max(0, (minTop - editorRect.top + (maxBottom - minTop) / 2)) + 'px';
            colHandle.style.left = (maxRight - editorRect.left + 2) + 'px';
            colHandle.style.height = '';
            colHandle.classList.add('visible');
        }

        if (rowHandle) {
            rowHandle.style.top = (maxBottom - editorRect.top + 2) + 'px';
            rowHandle.style.left = (minLeft - editorRect.left + (maxRight - minLeft) / 2) + 'px';
            rowHandle.style.width = '';
            rowHandle.classList.add('visible');
        }

        const btnMerge = document.getElementById('btnMergeCells');
        if (btnMerge) {
            const canMerge = currentSelectedCells.length > 1 || !!currentTableCellNode.nextElementSibling;
            btnMerge.style.opacity = canMerge ? '1' : '0.3';
            btnMerge.style.pointerEvents = canMerge ? 'auto' : 'none';
        }
    } else {
        clearCellSelection();
        menu.classList.remove('visible');
        if (colHandle) colHandle.classList.remove('visible');
        if (rowHandle) rowHandle.classList.remove('visible');
    }

    const h1 = document.getElementById('btnH1');
    const h2 = document.getElementById('btnH2');
    const h3 = document.getElementById('btnH3');
    if (h1) h1.classList.toggle('active', currentHeading === 'H1');
    if (h2) h2.classList.toggle('active', currentHeading === 'H2');
    if (h3) h3.classList.toggle('active', currentHeading === 'H3');

    [h1, h2, h3].forEach(btn => {
        if (btn) {
            btn.disabled = !!currentTableNode;
            btn.style.opacity = currentTableNode ? '0.3' : '1';
            btn.style.pointerEvents = currentTableNode ? 'none' : 'auto';
        }
    });

    const btnQuote = document.getElementById('btnQuote');
    if (btnQuote) btnQuote.classList.toggle('active', inBlockquote);

    const cmds = { 'btnBold': 'bold', 'btnItalic': 'italic', 'btnUnderline': 'underline', 'btnStrike': 'strikeThrough' };
    for (const [id, cmd] of Object.entries(cmds)) {
        const btn = document.getElementById(id);
        if (!btn) continue;
        let state = document.queryCommandState(cmd);
        if (cmd === 'bold' && currentHeading && state) state = hasBoldTag;
        btn.classList.toggle('active', state);
    }

    const btnUl = document.getElementById('btnUl');
    const btnOl = document.getElementById('btnOl');
    if (btnUl) btnUl.classList.toggle('active', document.queryCommandState('insertUnorderedList'));
    if (btnOl) btnOl.classList.toggle('active', document.queryCommandState('insertOrderedList'));
}

// --- Table Context Functions ---
function getTableContext() {
    return { cell: globalCurrentTableCell, table: globalCurrentTable };
}

function insertHtmlRow(position) {
    const { cell } = getTableContext();
    if (!cell) return;
    const tr = cell.closest('tr');
    if (!tr) return;
    const newTr = document.createElement('tr');
    const cellCount = tr.children.length;
    for (let i = 0; i < cellCount; i++) {
        const td = document.createElement('td');
        td.innerHTML = '<br>';
        newTr.appendChild(td);
    }
    if (position === 'before') {
        tr.parentNode.insertBefore(newTr, tr);
    } else {
        tr.parentNode.insertBefore(newTr, tr.nextSibling);
    }
    setTimeout(updateToolbarState, 10);
}

function insertHtmlCol(position) {
    const { cell, table } = getTableContext();
    if (!cell || !table) return;
    const tr = cell.closest('tr');
    const cellIndex = Array.from(tr.children).indexOf(cell);

    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
        const newCell = document.createElement(row.parentNode.tagName === 'THEAD' ? 'th' : 'td');
        newCell.innerHTML = '<br>';
        if (position === 'before') {
            row.insertBefore(newCell, row.children[cellIndex]);
        } else {
            row.insertBefore(newCell, row.children[cellIndex].nextSibling);
        }
    });
    setTimeout(updateToolbarState, 10);
}

function deleteHtmlRow() {
    const { cell, table } = getTableContext();
    if (!cell || !table) return;
    const tr = cell.closest('tr');
    tr.remove();
    if (table.querySelectorAll('tr').length === 0) table.remove();
    setTimeout(updateToolbarState, 10);
}

function deleteHtmlCol() {
    const { cell, table } = getTableContext();
    if (!cell || !table) return;
    const tr = cell.closest('tr');
    const cellIndex = Array.from(tr.children).indexOf(cell);

    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
        if (row.children[cellIndex]) {
            row.children[cellIndex].remove();
        }
    });

    const firstRow = table.querySelector('tr');
    if (!firstRow || firstRow.children.length === 0) table.remove();
    setTimeout(updateToolbarState, 10);
}

function deleteHtmlTable() {
    const { table } = getTableContext();
    if (table) table.remove();
    globalCurrentTable = null;
    globalCurrentTableCell = null;
    setTimeout(updateToolbarState, 10);
}

function mergeHtmlCells() {
    if (globalCurrentTable && currentSelectedCells.length > 1) {
        const firstCell = currentSelectedCells[0];
        const startRowIndex = firstCell.closest('tr').rowIndex;
        const startColIndex = Array.from(firstCell.closest('tr').children).indexOf(firstCell);

        let maxRowIdx = startRowIndex;
        let maxColIdx = startColIndex;

        currentSelectedCells.forEach(cell => {
            const rIdx = cell.closest('tr').rowIndex;
            const cIdx = Array.from(cell.closest('tr').children).indexOf(cell);
            if (rIdx > maxRowIdx) maxRowIdx = rIdx;
            if (cIdx > maxColIdx) maxColIdx = cIdx;
        });

        const rowSpan = maxRowIdx - startRowIndex + 1;
        const colSpan = maxColIdx - startColIndex + 1;

        let mergedContent = '';
        currentSelectedCells.forEach(cell => {
            let html = cell.innerHTML.trim();
            if (html && html !== '<br>') mergedContent += html + ' <br> ';
            if (cell !== firstCell) cell.remove();
        });

        mergedContent = mergedContent.replace(/(<br\s*\/?>\s*)+$/gi, '').trim();
        firstCell.innerHTML = mergedContent || '<br>';

        if (rowSpan > 1) firstCell.setAttribute('rowspan', rowSpan);
        if (colSpan > 1) firstCell.setAttribute('colspan', colSpan);

        firstCell.focus();
        currentSelectedCells = [firstCell];
        setTimeout(updateToolbarState, 10);
    } else {
        const { cell } = getTableContext();
        if (!cell) return;
        const nextCell = cell.nextElementSibling;
        if (nextCell) {
            const colspan = parseInt(cell.getAttribute('colspan') || '1');
            const nextColspan = parseInt(nextCell.getAttribute('colspan') || '1');
            cell.setAttribute('colspan', colspan + nextColspan);

            const cellText = cell.innerText.trim();
            const nextText = nextCell.innerText.trim();
            if (nextText) cell.innerHTML += ' <br> ' + nextCell.innerHTML;
            nextCell.remove();
            cell.focus();

            setTimeout(updateToolbarState, 10);
        }
    }
}

document.addEventListener('selectionchange', () => {
    if (isEditing && !showingSource) updateToolbarState();
});

// Source toggle
function toggleSource() {
    const area = document.getElementById('wysiwygArea');
    const src = document.getElementById('sourceTextarea');
    const toggle = document.getElementById('sourceToggle');

    if (showingSource) {
        showingSource = false;
        toggle.classList.remove('active');
        const md = src.value;
        try {
            area.innerHTML = marked.parse(md);
        } catch (e) {
            area.innerHTML = md.replace(/\n/g, '<br>');
        }
        area.style.display = '';
        src.style.display = 'none';
        area.focus();
    } else {
        showingSource = true;
        toggle.classList.add('active');
        src.value = htmlToMarkdown(area.innerHTML);
        area.style.display = 'none';
        src.style.display = 'block';

        src.oninput = function () {
            this.style.height = 'auto';
            this.style.height = this.scrollHeight + 'px';
        };
        src.oninput(); // trigger initial resize

        src.focus();
    }
}

function htmlToMarkdown(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return nodeToMd(doc.body).trim();
}

function nodeToMd(node) {
    let result = '';
    for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
            result += child.textContent;
        } else if (child.nodeType === Node.ELEMENT_NODE) {
            const tag = child.tagName.toLowerCase();
            const inner = nodeToMd(child);
            switch (tag) {
                case 'h1': result += '\n# ' + inner.trim() + '\n\n'; break;
                case 'h2': result += '\n## ' + inner.trim() + '\n\n'; break;
                case 'h3': result += '\n### ' + inner.trim() + '\n\n'; break;
                case 'h4': result += '\n#### ' + inner.trim() + '\n\n'; break;
                case 'h5': result += '\n##### ' + inner.trim() + '\n\n'; break;
                case 'p': result += inner.trim() + '\n\n'; break;
                case 'br': result += '\n'; break;
                case 'strong': case 'b': result += '**' + inner + '**'; break;
                case 'em': case 'i': result += '*' + inner + '*'; break;
                case 'u': result += '<u>' + inner + '</u>'; break;
                case 's': case 'strike': case 'del': result += '~~' + inner + '~~'; break;
                case 'code':
                    if (child.parentElement && child.parentElement.tagName === 'PRE') {
                        result += inner;
                    } else {
                        result += '`' + inner + '`';
                    }
                    break;
                case 'pre': result += '\n```\n' + inner.trim() + '\n```\n\n'; break;
                case 'blockquote': {
                    const lines = inner.trim().split('\n');
                    result += '\n' + lines.map(l => '> ' + l).join('\n') + '\n\n';
                    break;
                }
                case 'ul': {
                    const items = child.querySelectorAll(':scope > li');
                    items.forEach(li => { result += '- ' + nodeToMd(li).trim() + '\n'; });
                    result += '\n';
                    break;
                }
                case 'ol': {
                    const items = child.querySelectorAll(':scope > li');
                    items.forEach((li, i) => { result += (i + 1) + '. ' + nodeToMd(li).trim() + '\n'; });
                    result += '\n';
                    break;
                }
                case 'li': result += inner; break;
                case 'table': {
                    let tableMd = '\n\n';
                    let maxCols = 0;
                    const rows = child.querySelectorAll('tbody > tr, thead > tr, tr');
                    const uniqueRows = [];
                    rows.forEach(tr => {
                        if (uniqueRows.includes(tr) || tr.closest('table') !== child) return;
                        uniqueRows.push(tr);
                        const cells = tr.querySelectorAll('th, td');
                        maxCols = Math.max(maxCols, cells.length);
                    });

                    uniqueRows.forEach((tr, i) => {
                        const cells = Array.from(tr.querySelectorAll('th, td'));
                        let rowMd = '|';
                        for (let c = 0; c < maxCols; c++) {
                            const cell = cells[c];
                            const cellText = cell ? nodeToMd(cell).replace(/\n/g, '<br>').trim() : '';
                            rowMd += ' ' + cellText + ' |';
                        }
                        tableMd += rowMd + '\n';
                        if (i === 0) {
                            tableMd += '|';
                            for (let c = 0; c < maxCols; c++) {
                                tableMd += ' --- |';
                            }
                            tableMd += '\n';
                        }
                    });
                    result += tableMd + '\n';
                    break;
                }
                case 'a': result += '[' + inner + '](' + (child.getAttribute('href') || '') + ')'; break;
                case 'img': result += '![' + (child.getAttribute('alt') || '') + '](' + (child.getAttribute('src') || '') + ')'; break;
                case 'hr': result += '\n---\n\n'; break;
                case 'div': case 'section': case 'article': case 'span':
                    result += inner;
                    break;
                default:
                    result += inner;
            }
        }
    }
    return result;
}

document.addEventListener('keydown', function (e) {
    if (!isEditing) return;
    if (e.ctrlKey || e.metaKey) {
        if (e.key === 's') { e.preventDefault(); saveContent(); }
    }
});

async function saveContent() {
    let mdText;
    if (showingSource) {
        mdText = document.getElementById('sourceTextarea').value;
    } else {
        mdText = htmlToMarkdown(document.getElementById('wysiwygArea').innerHTML);
    }
    try {
        const res = await fetch(`/notes/${noteId}/content`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ extracted_text: mdText })
        });
        if (res.ok) {
            noteData.extracted_text = mdText;
            updateExtractedText();

            // Show a quick success indicator before returning to view
            const saveBtn = document.querySelector('.btn-primary i.ph-floppy-disk').parentNode;
            const origHtml = saveBtn.innerHTML;
            saveBtn.innerHTML = '<i class="ph ph-check"></i> Saved';
            setTimeout(() => {
                saveBtn.innerHTML = origHtml;
                cancelEdit();
            }, 500);
        } else {
            alert('Failed to save content');
        }
    } catch (err) {
        alert('Error saving: ' + err.message);
    }
}

// ===== SNAPSHOTS =====
async function loadSnapshots() {
    try {
        const res = await fetch(`/snapshots/${noteId}`);
        if (res.ok) {
            const snapshots = await res.json();
            renderSnapshots(snapshots);
        }
    } catch (e) { console.error('Error loading snapshots:', e); }
}

function renderSnapshots(snapshots) {
    const container = document.getElementById('snapshotList');
    const section = document.getElementById('snapshotsSection');

    if (!container || !section) {
        console.warn('Snapshots container not found in DOM');
        return;
    }

    if (!snapshots || snapshots.length === 0) {
        section.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    section.style.display = 'block';
    container.innerHTML = snapshots.map(s => `
        <div class="snapshot-item" onclick="viewSnapshot(${s.id})" style="padding: var(--spacing-sm); border-radius: var(--radius-md); cursor: pointer; margin-bottom: var(--spacing-sm); background: rgba(89, 60, 143, 0.05); transition: background 0.15s;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: var(--spacing-sm);">
                <div style="flex: 1; min-width: 0;">
                    <div class="snapshot-name" style="font-size: var(--font-size-sm); font-weight: 600; color: var(--color-dark-gray); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(s.name)}</div>
                    <div class="snapshot-date" style="font-size: var(--font-size-xs); color: var(--color-gray); margin-top: 2px;">${window.formatDate(s.created_at)}</div>
                </div>
                <button class="snapshot-delete" onclick="event.stopPropagation(); deleteSnapshot(${s.id})" title="Delete snapshot" style="padding: 4px; background: none; border: none; cursor: pointer; color: var(--color-gray); font-size: 1rem;">
                    <i class="ph ph-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

async function createSnapshot() {
    const nameInput = document.getElementById('snapshotNameInput');
    const name = nameInput.value.trim();
    if (!name) { alert('Please enter a snapshot name'); return; }

    const content = noteData.extracted_text || '';
    try {
        const res = await fetch(`/snapshots/${noteId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, content })
        });
        if (res.ok) {
            nameInput.value = '';
            loadSnapshots();
        } else {
            alert('Failed to create snapshot');
        }
    } catch (e) { alert('Error: ' + e.message); }
}

function promptCreateSnapshot() {
    const name = prompt('Enter snapshot name:');
    if (name && name.trim()) {
        const input = document.getElementById('snapshotNameInput');
        if (input) {
            input.value = name.trim();
            createSnapshot();
        }
    }
}

async function viewSnapshot(snapshotId) {
    try {
        const res = await fetch(`/snapshots/${noteId}/${snapshotId}`);
        if (res.ok) {
            const snapshot = await res.json();
            // Show snapshot content in the main view
            const textContainer = document.getElementById('extractedText');
            try {
                textContainer.innerHTML = marked.parse(snapshot.content);
            } catch (e) {
                textContainer.innerHTML = snapshot.content.replace(/\n/g, '<br>');
            }
            // If editing, also load into editor
            if (isEditing) {
                document.getElementById('editorTextarea').value = snapshot.content;
                updatePreview();
            }
            // Highlight active snapshot
            document.querySelectorAll('.snapshot-item').forEach(el => el.classList.remove('active'));
            event.target.closest('.snapshot-item')?.classList.add('active');
        }
    } catch (e) { alert('Error loading snapshot: ' + e.message); }
}

async function deleteSnapshot(snapshotId) {
    if (!confirm('Delete this snapshot?')) return;
    try {
        const res = await fetch(`/snapshots/${noteId}/${snapshotId}`, {
            method: 'DELETE'
        });
        if (res.status === 204) {
            loadSnapshots();
        }
    } catch (e) { alert('Error: ' + e.message); }
}

// ===== ACTIONS =====
function goToChat() {
    window.location.href = `/chat.html?note_id=${noteId}`;
}



// ===== SUMMARIZATION =====
function handleSummarizeClick() {
    if (!noteId) return;
    const lastVersionId = localStorage.getItem(`lastSummaryVersion_${noteId}`);
    if (lastVersionId) {
        window.location.href = `/note/${noteId}/summary/${lastVersionId}`;
    } else {
        window.location.href = `/note/${noteId}/summary`;
    }
}

let selectedExportFormat = 'pdf';

async function exportNote() {
    document.getElementById('exportModal').style.display = 'flex';
    document.getElementById('exportProgress').style.display = 'none';
    document.getElementById('exportSubmitBtn').disabled = false;

    // Load templates for dropdown
    try {
        const res = await fetch('/templates');
        if (res.ok) {
            const templates = await res.json();
            const select = document.getElementById('exportTemplateSelect');
            select.innerHTML = '<option value="">Default (no template)</option>';
            templates.forEach(t => {
                const badge = t.is_system ? ' ★' : '';
                select.innerHTML += `<option value="${t.id}">${t.name}${badge}</option>`;
            });
        }
    } catch (e) { console.error('Failed to load templates:', e); }
}

function closeExportModal() {
    document.getElementById('exportModal').style.display = 'none';
}

function selectExportFormat(format) {
    selectedExportFormat = format;
    document.querySelectorAll('.export-format-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.format === format);
    });
}

async function doExport() {
    const format = selectedExportFormat;

    const templateSelect = document.getElementById('exportTemplateSelect');
    const templateId = templateSelect.value || null;

    // Show progress
    document.getElementById('exportProgress').style.display = 'block';
    document.getElementById('exportSubmitBtn').disabled = true;
    updateExportProgress('Preparing export...', 5);

    // Simulate progress during the synchronous request
    const progressSteps = [
        { text: 'Building content...', pct: 15, delay: 500 },
        { text: 'Rendering document...', pct: 35, delay: 1500 },
        { text: 'Adding styles...', pct: 55, delay: 2500 },
        { text: 'Generating file...', pct: 70, delay: 4000 },
        { text: 'Finalizing...', pct: 85, delay: 6000 },
    ];
    const progressTimers = progressSteps.map(step =>
        setTimeout(() => updateExportProgress(step.text, step.pct), step.delay)
    );

    try {
        const payload = {
            format: format
        };
        if (templateId) payload.template_id = templateId;

        const response = await fetch(`/notes/${noteId}/export`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        // Clear simulated timers
        progressTimers.forEach(t => clearTimeout(t));

        if (response.ok) {
            const data = await response.json();
            updateExportProgress('Downloading file...', 95);

            // Download the file
            const dlRes = await fetch(data.download_url);
            if (dlRes.ok) {
                updateExportProgress('Complete!', 100);
                const blob = await dlRes.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                const ext = format === 'docx' ? 'docx' : 'pdf';
                a.download = `${noteData.title || 'note'}.${ext}`;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    window.URL.revokeObjectURL(url);
                    a.remove();
                }, 1000);
            }
            setTimeout(() => closeExportModal(), 500);
        } else {
            const error = await response.json();
            updateExportProgress('❌ ' + (error.detail || 'Export failed'), 0);
            document.getElementById('exportSubmitBtn').disabled = false;
        }
    } catch (error) {
        progressTimers.forEach(t => clearTimeout(t));
        updateExportProgress('❌ ' + error.message, 0);
        document.getElementById('exportSubmitBtn').disabled = false;
    }
}

function updateExportProgress(text, percent) {
    document.getElementById('exportProgressText').textContent = text;
    document.getElementById('exportProgressPercent').textContent = percent + '%';
    document.getElementById('exportProgressBar').style.width = percent + '%';
}

async function downloadOriginalFile() {
    try {
        const response = await fetch(`/notes/${noteId}/download-file`);
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;

            let filename = noteData.file_name || 'file';
            const disposition = response.headers.get('Content-Disposition');
            if (disposition && disposition.indexOf('filename=') !== -1) {
                const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
                if (matches != null && matches[1]) {
                    filename = matches[1].replace(/['"]/g, '');
                }
            }

            a.download = filename;
            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
                window.URL.revokeObjectURL(url);
                a.remove();
            }, 1000);
        } else {
            alert('Failed to download file');
        }
    } catch (e) { alert('Error: ' + e.message); }
}

function reprocessOCR() {
    document.getElementById('reprocessConfirmModal').classList.add('active');
}

function closeReprocessModal() {
    document.getElementById('reprocessConfirmModal').classList.remove('active');
}

async function confirmReprocess() {
    closeReprocessModal();
    const btn = document.getElementById('autoFormatBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Processing...'; }

    // Hide content and only show progress bar
    document.getElementById('viewContainer').style.display = 'none';
    document.getElementById('progressContainer').style.display = 'block';
    document.getElementById('progressFill').style.width = '10%';
    document.getElementById('progressPercent').textContent = '10%';
    document.getElementById('progressMessage').textContent = 'Initializing Smart Pipeline...';

    setTimeout(() => {
        document.getElementById('progressFill').style.width = '40%';
        document.getElementById('progressPercent').textContent = '40%';
        document.getElementById('progressMessage').textContent = 'Analyzing layout & extracting text...';
    }, 2000);

    setTimeout(() => {
        document.getElementById('progressFill').style.width = '70%';
        document.getElementById('progressPercent').textContent = '70%';
        document.getElementById('progressMessage').textContent = 'Structuring content...';
    }, 5000);

    try {
        const response = await fetch(`/notes/${noteId}/reprocess`, {
            method: 'POST'
        });
        if (response.ok) {
            document.getElementById('progressFill').style.width = '100%';
            document.getElementById('progressPercent').textContent = '100%';
            document.getElementById('progressMessage').textContent = 'Complete! Reloading...';
            setTimeout(() => {
                const refreshUrl = `${window.location.pathname}?refresh=${Date.now()}`;
                window.location.href = refreshUrl;
            }, 800);
        } else {
            let errorMsg = 'Failed to reprocess';
            try { const e = await response.json(); errorMsg = e.detail || errorMsg; } catch (e) { }
            alert('❌ Error: ' + errorMsg);
            document.getElementById('viewContainer').style.display = 'block';
            document.getElementById('progressContainer').style.display = 'none';
        }
    } catch (error) {
        alert('❌ Error: ' + error.message);
        document.getElementById('viewContainer').style.display = 'block';
        document.getElementById('progressContainer').style.display = 'none';
    }
    finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ph ph-magic-wand"></i> Auto Format'; }
    }
}

async function deleteNote() {
    if (!confirm('Delete this note? This cannot be undone.')) return;
    try {
        const response = await fetch(`/notes/${noteId}`, {
            method: 'DELETE'
        });
        if (response.ok || response.status === 204) {
            alert('Note deleted');
            if (noteData.subject_id) {
                window.location.href = `/subject.html?id=${noteData.subject_id}`;
            } else {
                window.location.href = '/mynotes.html';
            }
        } else {
            alert('Failed to delete note');
        }
    } catch (error) { alert('Error: ' + error.message); }
}

// ===== UTILITIES =====
function showError(message) {
    document.getElementById('loadingContainer').style.display = 'none';
    document.getElementById('noteContainer').style.display = 'none';
    document.querySelector('.note-action-panel').style.display = 'none';
    document.getElementById('errorContainer').style.display = 'block';
    document.getElementById('errorMessage').textContent = message;
}

function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, m => map[m]);
}



// Toggle sidebar scroll based on window scroll position
window.addEventListener('scroll', () => {
    const sidebar = document.querySelector('.note-action-panel');
    if (sidebar) {
        sidebar.classList.toggle('can-scroll', window.scrollY > 0);
    }
});

// ===== INLINE CHAT =====
let chatInitialized = false;

function toggleChat() {
    const panel = document.getElementById('noteChatPanel');
    if (!panel) return;
    
    const isHidden = panel.style.display === 'none' || !panel.classList.contains('mobile-active');
    
    if (window.innerWidth <= 1024) {
        // Mobile/Tablet: Use drawer
        panel.style.display = 'flex';
        setTimeout(() => panel.classList.toggle('mobile-active'), 10);
    } else {
        // Desktop: Toggle display
        panel.style.display = isHidden ? 'flex' : 'none';
        panel.classList.remove('mobile-active');
    }

    const chatBtn = document.getElementById('mobileChatToggle');
    if (chatBtn) chatBtn.classList.toggle('active', isHidden);

    if (isHidden && !chatInitialized) {
        initInlineChat();
    }
    if (isHidden) {
        document.getElementById('noteChatInput').focus();
    }
}

window.toggleMobileActionPanel = function() {
    const panel = document.querySelector('.note-action-panel');
    const overlay = document.getElementById('mobileOverlay');
    if (panel) {
        panel.classList.toggle('mobile-expanded');
        const btn = document.getElementById('mobileMenuToggle');
        const isExpanded = panel.classList.contains('mobile-expanded');
        if (btn) btn.classList.toggle('active', isExpanded);
        if (overlay) overlay.classList.toggle('active', isExpanded);
        document.body.classList.toggle('menu-open', isExpanded);
    }
};


function toggleActionPanel() {
    const layout = document.querySelector('.app-layout');
    if (!layout) return;
    layout.classList.toggle('action-collapsed');
    const isCollapsed = layout.classList.contains('action-collapsed');
    localStorage.setItem('actionCollapsed', isCollapsed);
    const icon = document.getElementById('actionToggleIcon');
    if (icon) {
        icon.className = isCollapsed ? 'ph ph-caret-left' : 'ph ph-caret-right';
    }
}

// Initialize action collapsed icon state
document.addEventListener('DOMContentLoaded', () => {
    const layout = document.querySelector('.app-layout');
    const icon = document.getElementById('actionToggleIcon');
    if (layout && icon) {
        const isCollapsed = layout.classList.contains('action-collapsed');
        icon.className = isCollapsed ? 'ph ph-caret-left' : 'ph ph-caret-right';
    }
});

function initInlineChat() {
    chatInitialized = true;
    const input = document.getElementById('noteChatInput');
    const sendBtn = document.getElementById('noteChatSendBtn');
    input.disabled = false;
    sendBtn.disabled = false;
    input.addEventListener('keypress', e => { if (e.key === 'Enter') sendNoteChat(); });
    updateNoteChatModeButtons();
    updateNoteChatOutputButtons();
    updateNoteChatCompactDisplay();
    loadNoteChatHistory();
}

function setNoteChatMode(mode) {
    chatAiMode = mode;
    localStorage.setItem('globalAiMode', mode);
    updateNoteChatModeButtons();
    updateNoteChatCompactDisplay();
    // Close expanded view after selection
    document.getElementById('noteChatControlsCompact').style.display = 'flex';
    document.getElementById('noteChatControlsExpanded').style.display = 'none';
    document.getElementById('noteModeSelection').style.display = 'none';
    document.getElementById('noteOutputSelection').style.display = 'none';
}

function setNoteChatOutputFormat(format) {
    chatOutputFormat = format;
    localStorage.setItem('globalOutputFormat', format);
    updateNoteChatOutputButtons();
    updateNoteChatCompactDisplay();
    // Close expanded view after selection
    document.getElementById('noteChatControlsCompact').style.display = 'flex';
    document.getElementById('noteChatControlsExpanded').style.display = 'none';
    document.getElementById('noteModeSelection').style.display = 'none';
    document.getElementById('noteOutputSelection').style.display = 'none';
}

function toggleNoteChatMode() {
    const compact = document.getElementById('noteChatControlsCompact');
    const expanded = document.getElementById('noteChatControlsExpanded');
    const modeSelection = document.getElementById('noteModeSelection');
    const outputSelection = document.getElementById('noteOutputSelection');

    if (modeSelection.style.display === 'none') {
        compact.style.display = 'none';
        expanded.style.display = 'block';
        modeSelection.style.display = 'block';
        outputSelection.style.display = 'none';
    } else {
        expanded.style.display = 'none';
        modeSelection.style.display = 'none';
        compact.style.display = 'flex';
    }
}

function toggleNoteChatOutput() {
    const compact = document.getElementById('noteChatControlsCompact');
    const expanded = document.getElementById('noteChatControlsExpanded');
    const modeSelection = document.getElementById('noteModeSelection');
    const outputSelection = document.getElementById('noteOutputSelection');

    if (outputSelection.style.display === 'none') {
        compact.style.display = 'none';
        expanded.style.display = 'block';
        outputSelection.style.display = 'block';
        modeSelection.style.display = 'none';
    } else {
        expanded.style.display = 'none';
        outputSelection.style.display = 'none';
        compact.style.display = 'flex';
    }
}

function updateNoteChatModeButtons() {
    document.querySelectorAll('#noteModeSelection .mode-pill').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.mode === chatAiMode) {
            btn.classList.add('active');
        }
    });
}

function updateNoteChatOutputButtons() {
    document.querySelectorAll('#noteOutputSelection .mode-pill').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.format === chatOutputFormat) {
            btn.classList.add('active');
        }
    });
}

function updateNoteChatCompactDisplay() {
    const modeMeta = NOTE_MODE_META[chatAiMode];
    const outputMeta = NOTE_OUTPUT_FORMAT_META[chatOutputFormat];

    if (modeMeta) {
        document.getElementById('noteModeIcon').className = 'ph ' + modeMeta.icon;
        document.getElementById('noteModeLabel').textContent = modeMeta.label;
    }

    if (outputMeta) {
        document.getElementById('noteOutputIcon').className = 'ph ' + outputMeta.icon;
        document.getElementById('noteOutputLabel').textContent = outputMeta.label;
    }
}

async function loadNoteChatHistory() {
    try {
        const res = await fetch('/chat/conversations');
        if (!res.ok) return;
        const convos = await res.json();
        // Find the most recent conversation for this note
        const noteConvo = convos.find(c => c.scope_type === 'note' && c.scope_id == noteId);
        if (noteConvo) {
            chatConversationId = noteConvo.conversation_id;
            // Load messages
            const msgRes = await fetch(`/chat/conversations/${chatConversationId}/messages`);
            if (msgRes.ok) {
                const msgs = await msgRes.json();
                chatMessages = [];
                msgs.forEach(m => {
                    chatMessages.push({ role: 'user', content: m.message, time: new Date(m.created_at), ai_mode: m.ai_mode });
                    chatMessages.push({ role: 'ai', content: m.response, time: new Date(m.created_at), ai_mode: m.ai_mode, ai_model: m.ai_model });
                });
                displayChatMessages();
            }
        }
    } catch (e) { console.error('Error loading chat history:', e); }
}

async function sendNoteChat() {
    const input = document.getElementById('noteChatInput');
    const message = input.value.trim();
    if (!message || !noteId) return;

    if (!chatConversationId) chatConversationId = generateUUID();

    const replyInfo = window.replyingToMessageId !== null && window.replyingToMessageId !== undefined ? {
        id: window.replyingToMessageId,
        content: window.replyingToMessageContent
    } : null;

    chatMessages.push({
        role: 'user',
        content: message,
        time: new Date(),
        ai_mode: chatAiMode,
        replyTo: replyInfo
    });
    input.value = '';

    clearReply();
    displayChatMessages();

    // Loading bubble with dynamic text
    chatMessages.push({
        role: 'ai', loading: true,
        content: '<div class="loading-message"><span class="spinner" style="display: inline-flex; animation: spin 1s linear infinite;"><i class="ph-spinner" style="font-size: 16px;"></i></span> <span id="note-loading-text">Processing...</span></div>',
        time: new Date()
    });
    displayChatMessages();

    let currentLoadingTextIdx = 0;
    const loadingTexts = [
        "Processing...",
        "Retrieving...",
        "Searching Web...",
        "Building Answer..."
    ];
    const loadingInterval = setInterval(() => {
        const el = document.getElementById('note-loading-text');
        if (el) {
            currentLoadingTextIdx = Math.min(currentLoadingTextIdx + 1, loadingTexts.length - 1);
            el.innerText = loadingTexts[currentLoadingTextIdx];
        }
    }, 1000);

    try {
        const resp = await fetch('/chat/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                ai_mode: chatAiMode,
                output_format: chatOutputFormat,
                conversation_id: chatConversationId,
                note_id: noteId,
                auto_detect_conversation: true,
                reply_to_message_id: replyInfo ? replyInfo.id : null
            })
        });

        clearInterval(loadingInterval);
        chatMessages.pop(); // remove loading

        if (resp.ok) {
            const data = await resp.json();
            chatMessages.push({
                role: 'ai',
                content: data.response,
                time: new Date(),
                ai_mode: data.ai_mode || chatAiMode,
                ai_model: data.ai_model,
                sources: data.sources,
                detailed_sources: data.detailed_sources || [],
                thinking: data.thinking || null,
                timings: data.timings
            });
            if (data.conversation_id) chatConversationId = data.conversation_id;
            if (data.conversation_title) {
                document.getElementById('noteChatSubtitle').textContent = data.conversation_title;
            }

            const questionCount = chatMessages.filter(m => m.role === 'user').length;
            const metaEl = document.getElementById('chatMeta');
            if (metaEl) {
                metaEl.textContent = `${questionCount} question(s)`;
                metaEl.style.display = 'block';
            }
        } else {
            chatMessages.push({ role: 'ai', content: `Error (${resp.status}). Please try again.`, time: new Date() });
        }
    } catch (err) {
        clearInterval(loadingInterval);
        chatMessages.pop();
        chatMessages.push({ role: 'ai', content: 'Network error: ' + err.message, time: new Date() });
    }
    displayChatMessages();
}

// ── Reply Functions ──
function setReply(messageIndex) {
    const msg = chatMessages[messageIndex];
    window.replyingToMessageId = messageIndex;
    window.replyingToMessageContent = msg.content.replace(/<[^>]*>/g, '').substring(0, 100);
    displayChatMessages();
    document.getElementById('noteChatInput').focus();
}

function clearReply() {
    window.replyingToMessageId = null;
    window.replyingToMessageContent = null;
    displayChatMessages();
}

function displayChatMessages() {
    const container = document.getElementById('noteChatMessages');
    if (chatMessages.length === 0) {
        container.innerHTML = `<div class="empty-state">
            <i class="ph ph-chat-circle-dots" style="font-size:2rem;"></i>
            <p>Ask a question about this note</p></div>`;
        return;
    }

    // Inject reply indicator ABOVE the input box
    const inputArea = document.querySelector('.note-chat-input-area');
    let indicatorContainer = document.getElementById('inlineReplyIndicatorContainer');
    if (!indicatorContainer) {
        indicatorContainer = document.createElement('div');
        indicatorContainer.id = 'inlineReplyIndicatorContainer';
        inputArea.insertBefore(indicatorContainer, document.querySelector('.note-chat-input-row'));
    }

    if (window.replyingToMessageId !== null && window.replyingToMessageId !== undefined) {
        const replyMsg = chatMessages[window.replyingToMessageId];
        if (replyMsg) {
            const replyPreview = replyMsg.content.replace(/<[^>]*>/g, '').replace(/\[\d+\]/g, '');
            indicatorContainer.innerHTML = `
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
        }
    } else {
        indicatorContainer.innerHTML = '';
    }

    container.innerHTML = chatMessages.map((msg, idx) => {
        let contentHTML = msg.content;
        let referencesHTML = '';
        if (msg.role === 'ai' && !msg.loading && typeof marked !== 'undefined') {
            try { contentHTML = marked.parse(contentHTML); } catch (e) { }
            // Parse citations in the response if there are sources
            if (msg.detailed_sources && msg.detailed_sources.length > 0) {
                contentHTML = parseCitations(contentHTML);
            }
        }

        // AI mode badge
        let modeMeta = null;
        if (msg.role === 'ai' && !msg.loading && msg.ai_mode) {
            modeMeta = NOTE_MODE_META[msg.ai_mode] || { label: msg.ai_mode, icon: 'ph-sparkle' };
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
            const msgId = 'note-msg-' + idx;
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
                            <div class="source-item" onclick="window.open('${src.url}', '_blank')">
                                <div style="font-weight:600;color:#1976d2;margin-bottom:2px;">
                                    <i class="ph ph-globe"></i> [${citationNum}] Web Reference${score}
                                </div>
                                <div style="color:#666;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                                    ${src.url}
                                </div>
                                <div style="color:#999;font-size:9px;margin-top:2px;">${src.title || ''}</div>
                            </div>`;
                    }

                    const refNoteId = src.note_id || noteId;
                    // Truncate to ~10 words to prevent width expansion
                    let previewStr = src.text_preview || 'View reference';
                    const words = previewStr.split(' ');
                    if (words.length > 15) {
                        previewStr = words.slice(0, 15).join(' ') + '...';
                    }
                    return `
                        <div class="source-item" onclick="openSourceReference(${refNoteId}, ${src.position || 0})">
                            <div style="font-weight:600;color:#1976d2;margin-bottom:2px;">
                                <i class="ph ph-file-text"></i> [${citationNum}] Reference${score}
                            </div>
                            <div style="color:#666;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                                "${previewStr}"
                            </div>
                        </div>`;
                }).join('');
                sourcesHTML = `<div class="sources-section">${sourceLinks}</div>`;
            }

            const aiModel = msg.ai_model || null;
            const t = msg.timings || null;
            let infoContent = `
                <div style="padding:10px;background:#f9f9f9;border-radius:6px;">
                    <div style="margin-bottom:${t ? '8px' : '0'}">
                        <div style="font-weight:600;color:#333;margin-bottom:6px;"><i class="ph ph-robot"></i> Model: ${aiModel || '<span style="color:#aaa">Unknown</span>'}</div>
                    </div>
                    ${t && t.step_times ? `
                    <div style="border-top:1px solid #e0e0e0;padding-top:8px;">
                        <div style="font-weight:600;color:#333;margin-bottom:6px;"><i class="ph ph-list-numbers"></i> Process Timing (ms)</div>
                        <div style="display:flex;justify-content:space-between;padding:2px 0;"><span>1. Scope:</span><span>${t.step_times.step1.toFixed(2)}ms</span></div>
                        <div style="display:flex;justify-content:space-between;padding:2px 0;"><span>2. Convo:</span><span>${t.step_times.step2.toFixed(2)}ms</span></div>
                        <div style="display:flex;justify-content:space-between;padding:2px 0;"><span>3. Intent:</span><span>${t.step_times.step3.toFixed(2)}ms</span></div>
                        <div style="display:flex;justify-content:space-between;padding:2px 0;"><span>4. Context:</span><span>${t.step_times.step4.toFixed(2)}ms</span></div>
                        <div style="display:flex;justify-content:space-between;padding:2px 0;"><span>5. Web:</span><span>${t.step_times.step5.toFixed(2)}ms</span></div>
                        <div style="display:flex;justify-content:space-between;padding:2px 0;"><span>6. Prompt:</span><span>${t.step_times.step6.toFixed(2)}ms</span></div>
                        <div style="display:flex;justify-content:space-between;padding:2px 0;"><span>7. Gen:</span><span>${t.step_times.step7.toFixed(2)}ms</span></div>
                        <div style="display:flex;justify-content:space-between;padding:2px 0;"><span>8. Cites:</span><span>${t.step_times.step8.toFixed(2)}ms</span></div>
                        <div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid #f0f0f0;"><span>9. Save:</span><span>${t.step_times.step9.toFixed(2)}ms</span></div>
                        <div style="display:flex;justify-content:space-between;padding:4px 0;margin-top:2px;font-weight:600;color:var(--color-primary);"><span>Total:</span><span>${t.total_ms.toFixed(2)}ms</span></div>
                    </div>` : ''}
                </div>`;

            const refLabel = hasSources ? `Reference (${highestMatch}%)` : 'Reference';
            let toggleContent = '';

            if (modeMeta) {
                toggleContent += `<span style="display:inline-flex;align-items:center;gap:4px;color:var(--color-gray);"><i class="ph ${modeMeta.icon}"></i> ${modeMeta.label}</span><span class="reference-divider">|</span>`;
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

        let timeStr = formatMessageTime(msg.time);

        // WhatsApp-style reply quote
        let replyQuoteHTML = '';
        if (msg.replyTo && msg.role === 'user') {
            const replyAuthor = msg.replyTo.id !== undefined ? (chatMessages[msg.replyTo.id]?.role === 'user' ? 'You' : 'AI') : 'Unknown';
            const replyText = msg.replyTo.content?.replace(/<[^>]*>/g, '').replace(/\[\d+\]/g, '') || 'Replied message';
            replyQuoteHTML = `
                <div class="message-reply-quote">
                    <span class="message-reply-quote-author">↳ ${replyAuthor}</span>
                    <span class="message-reply-quote-text">"${replyText}"</span>
                </div>`;
        }

        // Check if this message is being replied to
        const isHighlightedForReply = (window.replyingToMessageId === idx && msg.role === 'user') ? ' highlighted-for-reply' : '';

        // Reply button only for non-loading
        let actionsHTML = '';
        if (!msg.loading) {
            actionsHTML = `
                <button class="action-btn" title="Reply to this message" onclick="setReply(${idx})">
                    <i class="ph ph-arrow-bend-up-right"></i>
                </button>`;
        }

        return `<div class="message ${msg.role}${isHighlightedForReply}">
            ${msg.role === 'ai' ? `<div class="message-side"></div>` : ''}
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
    container.scrollTop = container.scrollHeight;
}

function formatMessageTime(date) {
    if (!(date instanceof Date)) date = new Date(date);
    return date.toLocaleString([], { hour: '2-digit', minute: '2-digit' });
}

function toggleThinking(header) {
    header.querySelector('.note-thinking-icon').classList.toggle('expanded');
    header.nextElementSibling.classList.toggle('expanded');
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

function openSourceReference(noteId, position) {
    if (!noteId) return;
    const currentNoteId = window.location.pathname.split('/').pop();
    // If it's the current note, just navigate to position on same page
    if (noteId == currentNoteId) {
        navigateToReferencePosition(position);
    } else {
        // Otherwise navigate to the other note and scroll to position
        window.location.href = `/note/${noteId}#pos-${position}`;
    }
}

// ── Citation Parsing ──
function parseCitations(text) {
    const citationPattern = /\[(\d+)\]/g;
    return text.replace(citationPattern, (match, num) => {
        return `<span class="note-citation-link" data-citation-num="${num}" onclick="handleCitationClick(event, ${num})">[${num}]</span>`;
    });
}

function handleCitationClick(event, citationNum) {
    event.preventDefault();
    event.stopPropagation();

    const messageContent = event.target.closest('.message-content');
    if (!messageContent) return;

    const message = messageContent.closest('.message');
    if (!message) return;

    const sourceItems = message.querySelectorAll('.source-item');
    if (citationNum > 0 && citationNum <= sourceItems.length) {
        const targetSource = sourceItems[citationNum - 1];
        const onclickAttr = targetSource.getAttribute('onclick');
        if (onclickAttr) {
            eval(onclickAttr);
        } else {
            highlightCitation(event, citationNum);
        }
    }
}

function highlightCitation(event, citationNum) {
    event.preventDefault();
    event.stopPropagation();

    document.querySelectorAll('.note-citation-link.highlighted, .source-item.highlighted-source').forEach(el => {
        el.classList.remove('highlighted', 'highlighted-source');
    });

    const clickedCitation = event.target;
    if (clickedCitation.classList.contains('note-citation-link')) {
        clickedCitation.classList.add('highlighted');
    }

    const sourceItems = document.querySelectorAll('.source-item');
    if (citationNum > 0 && citationNum <= sourceItems.length) {
        const targetSource = sourceItems[citationNum - 1];
        targetSource.classList.add('highlighted-source');
        targetSource.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function goToChat() {
    window.location.href = `/chat.html?note_id=${noteId}`;
}

if (typeof marked === 'undefined') {
    document.write('<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>');
}
// Configure marked.js to support tables and other GFM features
marked.setOptions({
    gfm: true,           // GitHub Flavored Markdown (includes tables)
    breaks: false,        // Don't convert \n to <br>
    pedantic: false,
    smartLists: true,
    smartypants: false
});
