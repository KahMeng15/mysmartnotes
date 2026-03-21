// Summary Page Logic
let lectureId = null;
let token = localStorage.getItem('token');
let summaryData = null;
let quickreadData = null;
let currentSummaryMode = 'elaborate';
let currentSummaryFormat = 'sentence';
let isRegeneratingSummary = false;
let currentProcessingMethod = 'whole';
let currentVersionId = null;
let deleteConfirmVersionId = null;
let currentSplitLevel = null;
let currentProcessingTime = null;
let currentProcessingTimeMs = null;
let currentAIModel = null;
let currentNoteTitleForBreadcrumb = null;
let isUserEdited = false;
let isEditMode = false;
let isSourceMode = false;

const MODE_META = {
    quick: { label: 'Quick', icon: 'ph-lightning' },
    simple: { label: 'Simple', icon: 'ph-text-a-underline' },
    elaborate: { label: 'Elaborate', icon: 'ph-lightbulb' },
    eli5: { label: 'ELI5', icon: 'ph-smiley' }
};

const FORMAT_META = {
    sentence: { label: 'Sentence', icon: 'ph-text-t' },
    pointform: { label: 'Pointform', icon: 'ph-list-bullets' },
    numbered_list: { label: 'Numbered List', icon: 'ph-list-numbers' },
    table: { label: 'Table', icon: 'ph-table' }
};

document.addEventListener('DOMContentLoaded', async () => {
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    // Extract lectureId from URL path: /note/{id}/summary
    const pathParts = window.location.pathname.split('/');
    lectureId = pathParts[2]; // Path is /note/ID/summary

    if (!lectureId) {
        alert('Invalid Note ID');
        window.location.href = '/dashboard';
        return;
    }

    // Navigation buttons
    const sidebarBackBtn = document.getElementById('sidebarBackBtn');
    if (sidebarBackBtn) sidebarBackBtn.onclick = () => window.location.href = `/note/${lectureId}`;

    // Load persistent display choices
    const savedObjectives = localStorage.getItem('summaryShowObjectives');
    const savedQuickread = localStorage.getItem('summaryShowQuickread');
    
    if (savedObjectives !== null) {
        const toggleObjectives = document.getElementById('toggleObjectives');
        if (toggleObjectives) toggleObjectives.checked = savedObjectives === 'true';
    }
    
    if (savedQuickread !== null) {
        const toggleQuickread = document.getElementById('toggleQuickread');
        if (toggleQuickread) toggleQuickread.checked = savedQuickread === 'true';
    }

    // Load initial data
    await loadNoteMetadata();
    const summaries = await loadSummaryVersions();
    
    if (summaries && summaries.length > 0) {
        // Try to load last selected version
        const lastVersionId = localStorage.getItem(`lastSummaryVersion_${lectureId}`);
        let versionToLoad = summaries[0];
        
        if (lastVersionId) {
            const found = summaries.find(s => s.id == lastVersionId);
            if (found) versionToLoad = found;
        }
        
        await loadSummaryVersion(versionToLoad.id);
    } else {
        showNoSummaryUI();
        showSummaryOptions(false);
    }
});

async function loadSummaryVersions() {
    try {
        const res = await fetch(`/documents?lecture_id=${lectureId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const docs = await res.json();
            const summaries = docs.filter(d => d.document_type === 'summary').sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            const list = document.getElementById('summaryList');
            if (!list) return summaries;
            
            if (summaries.length === 0) {
                list.innerHTML = '<div class="empty-state" style="padding: var(--spacing-md); font-size: var(--font-size-xs);">No summaries yet</div>';
                return summaries;
            }
            
            list.innerHTML = summaries.map((s, idx) => {
                const date = new Date(s.created_at);
                const isSelected = currentVersionId === s.id;
                // If title is just "Summary - X", fallback to generic version. Otherwise use title.
                let label = s.title.startsWith('Summary -') ? `Version ${summaries.length - idx}` : s.title;
                if (s.is_user_edited) {
                    label += ' (Edited)';
                }
                
                const bgColor = isSelected ? 'rgba(89, 60, 143, 0.1)' : 'var(--color-white)';
                const borderColor = isSelected ? 'var(--color-primary)' : 'var(--color-light-gray)';
                
                // Format date using browser's local timezone (includes both date and time)
                const dateString = date.toLocaleString(undefined, { 
                    month: 'short', 
                    day: 'numeric',
                    year: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                
                return `
                <div class="summary-version-item" style="display: flex; justify-content: space-between; align-items: center; padding: 8px; border: 1px solid ${borderColor}; border-radius: var(--radius-sm); background: ${bgColor}; cursor: pointer; transition: all 0.15s;" onmouseover="this.style.borderColor='var(--color-primary)'" onmouseout="this.style.borderColor='${borderColor}'" onclick="loadSummaryVersion(${s.id})">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: var(--font-size-xs); font-weight: 600; color: var(--color-dark); display: flex; align-items: center; gap: 6px;">
                            ${label}
                        </div>
                        <div style="font-size: 10px; color: var(--color-gray); margin-top: 2px;">${dateString}</div>
                    </div>
                    <button class="btn btn-outline btn-small" style="color: var(--color-error); padding: 4px 8px; margin-left: 8px;" onclick="event.stopPropagation(); showDeleteConfirm(${s.id})" title="Delete">
                        <i class="ph ph-trash"></i>
                    </button>
                </div>
                `;
            }).join('');
            return summaries;
        }
    } catch (e) { console.error('Error loading versions:', e); }
    return [];
}

async function loadSummaryVersion(docId) {
    if (isEditMode) {
        alert('Please save or discard your changes before switching versions.');
        return;
    }
    try {
        const res = await fetch(`/documents/${docId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            if (data.content) {
                // Save last selected version ID
                localStorage.setItem(`lastSummaryVersion_${lectureId}`, docId);
                
                summaryData = data.content;
                quickreadData = data.quickread || null;
                currentSummaryMode = data.mode || 'elaborate';
                currentSummaryFormat = data.output_format || 'sentence';
                currentProcessingMethod = data.processing_method || 'whole';
                currentSplitLevel = data.split_level || null;
                currentProcessingTime = data.processing_time || null;
                currentProcessingTimeMs = data.processing_time_ms || null;
                currentAIModel = data.model || null;
                isUserEdited = data.is_user_edited || false;
                currentVersionId = docId;
                displaySummary();
                loadSummaryVersions();
                
                // Update breadcrumb when switching version
                loadNoteMetadata();
            }
        }
    } catch (e) { console.error('Error loading version:', e); }
}

function showDeleteConfirm(docId) {
    deleteConfirmVersionId = docId;
    document.getElementById('deleteConfirmModal').classList.add('active');
}

function closeDeleteConfirmModal() {
    document.getElementById('deleteConfirmModal').classList.remove('active');
    deleteConfirmVersionId = null;
}

async function confirmDeleteVersion() {
    const docIdToDelete = deleteConfirmVersionId;
    if (!docIdToDelete) return;
    
    closeDeleteConfirmModal();
    
    try {
        const res = await fetch(`/documents/${docIdToDelete}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok || res.status === 204) {
            const summaries = await loadSummaryVersions();
            
            if (summaries.length === 0) {
                currentVersionId = null;
                summaryData = null;
                showNoSummaryUI();
                await loadNoteMetadata(); // Refresh breadcrumb to remove version info
            } else {
                // Load the next available version (latest)
                await loadSummaryVersion(summaries[0].id);
            }
        }
    } catch (e) { 
        alert('Error deleting summary version: ' + e.message);
    }
}

function showNoSummaryUI() {
    const summaryText = document.getElementById('summaryText');
    const noteHeader = document.getElementById('noteHeader');
    const summaryContainer = document.getElementById('summaryContainer');
    if (!summaryText) return;
    
    // Add class for flex centering
    if (summaryContainer) summaryContainer.classList.add('flex-centering-active');
    
    // Set text container to flex as well
    summaryText.style.display = 'flex';
    summaryText.style.flexDirection = 'column';
    summaryText.style.flex = '1';

    // Hide header (which shows mode/format pills)
    if (noteHeader) noteHeader.style.display = 'none';

    summaryText.innerHTML = `
        <div class="empty-summary-container">
            <i class="ph ph-sparkle empty-summary-icon"></i>
            <h2 class="empty-summary-title">No Summary Yet</h2>
            <p class="empty-summary-text">
                Create your first AI-generated summary to quickly understand the key points of your note.
            </p>
            <button class="btn btn-primary empty-summary-btn" onclick="showSummaryOptions(false)">
                <i class="ph ph-plus" style="margin-right: 8px;"></i> Generate Summary
            </button>
        </div>
    `;
    
    // Also reset detail values
    const details = ['detailsProcessingMode', 'detailsModel', 'detailsFormat', 'detailsProcessingTime'];
    details.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '—';
    });
    const divItem = document.getElementById('detailsDividerItem');
    if (divItem) divItem.style.display = 'none';
    
    currentAIModel = null;
    currentProcessingTime = null;
    currentProcessingTimeMs = null;
    isUserEdited = false;
    
    const quickreadContainer = document.getElementById('quickreadContainer');
    if (quickreadContainer) quickreadContainer.style.display = 'none';
}

async function loadNoteMetadata() {
    try {
        const res = await fetch(`/lectures/${lectureId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const note = await res.json();
            const noteTitleEl = document.getElementById('noteTitle');
            if (noteTitleEl) noteTitleEl.textContent = note.title;
            
            // Store for breadcrumb
            currentNoteTitleForBreadcrumb = note.title;
            
            // Update breadcrumbs and titles
            if (note.subject) {
                const groupLink = document.getElementById('metaGroup');
                const subjectLink = document.getElementById('metaSubject');
                const noteBreadcrumb = document.getElementById('noteBreadcrumb');
                const contentSubjectName = document.getElementById('contentSubjectName');
                
                if (contentSubjectName) contentSubjectName.textContent = note.title;
                
                // Build complete breadcrumb: Group > Subject > Note > Summary Title
                let breadcrumbHTML = '';
                if (note.subject.group && note.subject.group.name) {
                    breadcrumbHTML += `<a href="/dashboard?group=${note.subject.group.id}" class="note-nav-crumb-link">${note.subject.group.name}</a>`;
                } else {
                    breadcrumbHTML += `<a href="/dashboard" class="note-nav-crumb-link">My Notes</a>`;
                }
                breadcrumbHTML += `<span class="note-nav-sep">›</span>`;
                breadcrumbHTML += `<a href="/subject.html?id=${note.subject.id}" class="note-nav-crumb-link">${note.subject.name}</a>`;
                breadcrumbHTML += `<span class="note-nav-sep">›</span>`;
                breadcrumbHTML += `<a href="/note/${lectureId}" class="note-nav-crumb-link">${note.title}</a>`;
                breadcrumbHTML += `<span class="note-nav-sep">›</span>`;
                
                if (currentVersionId) {
                    // Add summary mode to breadcrumb - use class instead of inline styles
                    const summaryModeLabel = MODE_META[currentSummaryMode]?.label || 'Summary';
                    breadcrumbHTML += `<a class="note-nav-crumb-link">${summaryModeLabel} in ${FORMAT_META[currentSummaryFormat]?.label || 'Summary'}</a>`;
                } else {
                    breadcrumbHTML += `<a class="note-nav-crumb-link">AI Summary</a>`;
                }
                
                if (noteBreadcrumb) {
                    noteBreadcrumb.innerHTML = breadcrumbHTML;
                }
                
                if (groupLink) {
                    if (note.subject.group && note.subject.group.name) {
                        groupLink.textContent = note.subject.group.name;
                        groupLink.href = `/dashboard?group=${note.subject.group.id}`;
                    } else {
                        groupLink.textContent = "My Notes";
                        groupLink.href = `/dashboard`;
                    }
                }
                
                if (subjectLink) {
                    subjectLink.textContent = note.subject.name;
                    subjectLink.href = `/subject.html?id=${note.subject.id}`;
                }
            }
        }
    } catch (e) { console.error('Error loading metadata:', e); }
}

function displaySummary() {
    const summaryText = document.getElementById('summaryText');
    const noteHeader = document.getElementById('noteHeader');
    const summaryContainer = document.getElementById('summaryContainer');
    const quickreadContainer = document.getElementById('quickreadContainer');
    const displayAiModePill = document.getElementById('displayAiModePill');
    const displayAiFormatPill = document.getElementById('displayAiFormatPill');
    const toggleQuickread = document.getElementById('toggleQuickread');
    const toggleObjectives = document.getElementById('toggleObjectives');
    
    if (!summaryData) return;
    
    // Remove centering class when content exists
    if (summaryContainer) summaryContainer.classList.remove('flex-centering-active');

    // Reset any empty state styles on the text container
    if (summaryText) {
        summaryText.style.display = 'block';
        summaryText.style.flex = 'none';
    }

    // Show header if it was hidden
    if (noteHeader) {
        noteHeader.style.display = 'block';
    }

    // Update Mode & Format Display
    if (displayAiModePill) {
        const modeLabel = MODE_META[currentSummaryMode]?.label || currentSummaryMode;
        const modeIcon = MODE_META[currentSummaryMode]?.icon || 'ph-lightbulb';
        displayAiModePill.innerHTML = `<i class="ph ${modeIcon}"></i> ${modeLabel}`;
    }
    if (displayAiFormatPill) {
        const formatLabel = FORMAT_META[currentSummaryFormat]?.label || currentSummaryFormat;
        const formatIcon = FORMAT_META[currentSummaryFormat]?.icon || 'ph-text-t';
        displayAiFormatPill.innerHTML = `<i class="ph ${formatIcon}"></i> ${formatLabel}`;
    }
    
    // 1. First, restore user's base preferences from localStorage
    const savedObjectives = localStorage.getItem('summaryShowObjectives');
    const savedQuickread = localStorage.getItem('summaryShowQuickread');

    if (toggleObjectives && savedObjectives !== null) {
        toggleObjectives.checked = savedObjectives === 'true';
    }
    if (toggleQuickread && savedQuickread !== null) {
        toggleQuickread.checked = savedQuickread === 'true';
    }

    // 2. Then, handle specific version overrides (Whole note processing disables Quickread)
    if (toggleQuickread) {
        const label = toggleQuickread.closest('.sidebar-option-label');
        if (currentProcessingMethod === 'whole') {
            toggleQuickread.checked = false; // Forced off for UI
            toggleQuickread.disabled = true;
            if (label) {
                label.classList.add('disabled');
                label.title = 'Quickread only available for section-by-section processing';
            }
        } else {
            toggleQuickread.disabled = false;
            if (label) {
                label.classList.remove('disabled');
                label.title = '';
            }
        }
    }

    // 3. Update details and render markdown
    updateDetailsSection();
    
    try {
        summaryText.innerHTML = marked.parse(summaryData);
    } catch (e) {
        summaryText.innerHTML = summaryData.replace(/\n/g, '<br>');
    }
    
    // Show Quickread at the top if it exists
    if (currentProcessingMethod === 'section' && quickreadData) {
        if (quickreadContainer) {
            quickreadContainer.style.display = 'block';
            const quickreadContent = document.getElementById('quickreadContent');
            if (quickreadContent) {
                try {
                    quickreadContent.innerHTML = marked.parse(quickreadData);
                } catch (e) {
                    quickreadContent.textContent = quickreadData;
                }
            }
        }
    } else if (quickreadContainer) {
        quickreadContainer.style.display = 'none';
    }
    
    // 4. Finally, apply visibility settings to hide sections from the raw content
    hideRedundantSections();
}

function formatProcessingTime(ms) {
    if (ms === null || ms === undefined || ms === 0) return '—';
    return `${ms}ms`;
}

function updateDetailsSection() {
    const detailsProcessingMode = document.getElementById('detailsProcessingMode');
    const detailsModel = document.getElementById('detailsModel');
    const detailsEdited = document.getElementById('detailsEdited');
    const detailsDividerItem = document.getElementById('detailsDividerItem');
    const detailsDivider = document.getElementById('detailsDivider');
    const detailsFormat = document.getElementById('detailsFormat');
    const detailsProcessingTime = document.getElementById('detailsProcessingTime');
    
    if (detailsProcessingMode) {
        const modeText = currentProcessingMethod === 'section' ? 'Section by section' : 'Whole note';
        detailsProcessingMode.textContent = modeText;
    }

    if (detailsModel) {
        detailsModel.textContent = currentAIModel || '—';
    }

    if (detailsEdited) {
        detailsEdited.textContent = isUserEdited ? 'Yes' : 'No';
        detailsEdited.style.color = isUserEdited ? 'var(--color-primary)' : 'inherit';
        detailsEdited.style.fontWeight = isUserEdited ? '600' : 'normal';
    }
    
    // Show divider info only for section-by-section processing
    if (detailsDividerItem && detailsDivider) {
        if (currentProcessingMethod === 'section' && currentSplitLevel) {
            detailsDividerItem.style.display = 'flex';
            detailsDivider.textContent = currentSplitLevel.toUpperCase();
        } else {
            detailsDividerItem.style.display = 'none';
        }
    }
    
    if (detailsFormat) {
        const formatLabel = FORMAT_META[currentSummaryFormat]?.label || currentSummaryFormat;
        detailsFormat.textContent = formatLabel;
    }
    
    if (detailsProcessingTime) {
        // Use MS if available, fallback to legacy seconds field
        const timeVal = currentProcessingTimeMs !== null ? currentProcessingTimeMs : 
                       (currentProcessingTime ? Math.round(currentProcessingTime * 1000) : null);
        detailsProcessingTime.textContent = formatProcessingTime(timeVal);
    }
}

// Reuse modal logic from note.js but tailored for this page
function showSummaryOptions(regenerate = false) {
    isRegeneratingSummary = regenerate;
    document.getElementById('summaryOptionsModal').classList.add('active');
}

function closeSummaryModal() {
    document.getElementById('summaryOptionsModal').classList.remove('active');
}

function setSummaryMode(mode) {
    currentSummaryMode = mode;
    document.querySelectorAll('#summaryModeBar .mode-pill').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
}

function setSummaryFormat(format) {
    currentSummaryFormat = format;
    document.querySelectorAll('#summaryOutputBar .mode-pill').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.format === format);
    });
}

function onSummaryMethodChange() {
    const method = document.getElementById('summaryProcessMethod').value;
    currentProcessingMethod = method;
    document.getElementById('splitLevelContainer').style.display = method === 'section' ? 'block' : 'none';
}

function toggleElement(elementId, show, saveToStorage = true) {
    // Safety check for Quickread
    if (elementId === 'quickreadSection' && currentProcessingMethod === 'whole' && show) {
        const toggleQuickread = document.getElementById('toggleQuickread');
        if (toggleQuickread) toggleQuickread.checked = false;
        return;
    }

    // Hide/show sections from the raw note content based on checkbox state
    const summaryText = document.getElementById('summaryText');
    if (!summaryText) return;
    
    const headers = summaryText.querySelectorAll('h2, h3, h4, h5');
    
    if (elementId === 'objectivesSection') {
        if (saveToStorage) localStorage.setItem('summaryShowObjectives', show);
        // Hide/show "Objectives" sections
        const objectivePatterns = [
            /^(Learning\s+Objectives?|Module\s+Objectives?|Objectives?)/i
        ];
        
        headers.forEach(header => {
            for (const pattern of objectivePatterns) {
                if (pattern.test(header.textContent.trim())) {
                    header.style.display = show ? '' : 'none';
                    
                    // Also hide/show content until next header
                    let current = header.nextElementSibling;
                    while (current && !current.matches('h2, h3, h4, h5')) {
                        current.style.display = show ? '' : 'none';
                        current = current.nextElementSibling;
                    }
                    break;
                }
            }
        });
    } else if (elementId === 'quickreadSection') {
        if (saveToStorage) localStorage.setItem('summaryShowQuickread', show);
        // Hide/show quickread container
        const quickreadContainer = document.getElementById('quickreadContainer');
        if (quickreadContainer) {
            quickreadContainer.style.display = show ? 'block' : 'none';
        }
    }
}

function hideRedundantSections() {
    // Apply current checkbox states to hide/show sections
    const toggleObjectives = document.getElementById('toggleObjectives');
    const toggleQuickread = document.getElementById('toggleQuickread');
    
    if (toggleObjectives) {
        toggleElement('objectivesSection', toggleObjectives.checked, false);
    }
    if (toggleQuickread) {
        toggleElement('quickreadSection', toggleQuickread.checked, false);
    }
}

function updateSummaryProgress(percent, message, label) {
    const fill = document.getElementById('summaryProgressFill');
    const percentText = document.getElementById('summaryProgressPercent');
    const msgText = document.getElementById('summaryProgressMessage');
    const labelText = document.getElementById('summaryProgressLabel');
    
    if (fill) fill.style.width = `${percent}%`;
    if (percentText) percentText.textContent = `${percent}%`;
    if (msgText && message) msgText.textContent = message;
    if (labelText && label) labelText.textContent = label;
}

async function generateSummary() {
    const method = document.getElementById('summaryProcessMethod').value;
    const splitLevel = document.getElementById('summarySplitLevel').value;
    
    closeSummaryModal();
    document.getElementById('summaryProgressModal').classList.add('active');
    updateSummaryProgress(0, 'Initializing AI model...', 'Working...');
    
    let currentPercent = 5;
    let progressInterval = setInterval(() => {
        if (currentPercent < 90) {
            currentPercent += Math.random() * 5;
            updateSummaryProgress(Math.floor(currentPercent), 'Summarizing note content...', 'Processing');
        }
    }, 1500);

    try {
        const res = await fetch('/documents/summary', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                lecture_id: lectureId,
                mode: currentSummaryMode,
                output_format: currentSummaryFormat,
                processing_method: method,
                split_level: splitLevel,
                force_regenerate: isRegeneratingSummary,
                include_quickread: method === 'section'
            })
        });

        clearInterval(progressInterval);

        if (res.ok) {
            updateSummaryProgress(100, 'Complete!', 'Done');
            const data = await res.json();
            summaryData = data.content;
            quickreadData = data.quickread || null;
            currentSummaryMode = data.mode || 'elaborate';
            currentSummaryFormat = data.output_format || 'sentence';
            currentProcessingMethod = data.processing_method || 'whole';
            currentSplitLevel = data.split_level || null;
            currentProcessingTime = data.processing_time || null;
            currentProcessingTimeMs = data.processing_time_ms || null;
            currentAIModel = data.model || null;
            isUserEdited = data.is_user_edited || false;
            currentVersionId = data.id;
            
            setTimeout(() => {
                document.getElementById('summaryProgressModal').classList.remove('active');
                displaySummary();
                loadSummaryVersions();
                loadNoteMetadata();
                isRegeneratingSummary = false;
            }, 600);
        } else {
            document.getElementById('summaryProgressModal').classList.remove('active');
            alert('Failed to generate summary');
        }
    } catch (e) {
        clearInterval(progressInterval);
        document.getElementById('summaryProgressModal').classList.remove('active');
        alert('Error: ' + e.message);
    }
}

// --- Editor Logic (Mirrored from note.js) ---

function toggleEdit() {
    if (!currentVersionId) return;
    
    const viewContainer = document.getElementById('viewContainer');
    const editorContainer = document.getElementById('editorContainer');
    const editBtn = document.getElementById('editBtn');
    const wysiwygArea = document.getElementById('wysiwygArea');
    const sourceTextarea = document.getElementById('sourceTextarea');
    
    isEditMode = !isEditMode;
    
    if (isEditMode) {
        // Switch to Edit
        const summaryContainer = document.getElementById('summaryContainer');
        if (summaryContainer) summaryContainer.classList.add('flex-centering-active');
        
        if (viewContainer) viewContainer.style.display = 'none';
        if (editorContainer) {
            editorContainer.style.display = 'flex';
            editorContainer.classList.add('active');
        }
        if (editBtn) {
            editBtn.classList.add('active');
            editBtn.innerHTML = '<i class="ph ph-eye"></i> <span>View</span>';
        }
        
        // Load content into editor
        if (wysiwygArea) wysiwygArea.innerHTML = marked.parse(summaryData || '');
        if (sourceTextarea) sourceTextarea.value = summaryData || '';
        
        isSourceMode = false;
        if (sourceTextarea) sourceTextarea.style.display = 'none';
        if (wysiwygArea) wysiwygArea.style.display = 'block';
    } else {
        // Switch back to view
        cancelEdit();
    }
}

function cancelEdit() {
    isEditMode = false;
    const viewContainer = document.getElementById('viewContainer');
    const editorContainer = document.getElementById('editorContainer');
    const editBtn = document.getElementById('editBtn');
    const summaryContainer = document.getElementById('summaryContainer');
    
    if (summaryContainer) summaryContainer.classList.remove('flex-centering-active');
    
    if (viewContainer) viewContainer.style.display = 'block';
    if (editorContainer) {
        editorContainer.style.display = 'none';
        editorContainer.classList.remove('active');
    }
    if (editBtn) {
        editBtn.classList.remove('active');
        editBtn.innerHTML = '<i class="ph ph-pencil-simple"></i> <span>Edit</span>';
    }
}

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

async function saveContent() {
    const wysiwygArea = document.getElementById('wysiwygArea');
    const sourceTextarea = document.getElementById('sourceTextarea');
    
    let newContent = isSourceMode ? sourceTextarea.value : htmlToMarkdown(wysiwygArea.innerHTML);
    
    try {
        const res = await fetch(`/documents/${currentVersionId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ content: newContent })
        });
        
        if (res.ok) {
            const data = await res.json();
            summaryData = data.content;
            isUserEdited = data.is_user_edited;
            
            // UI Feedback
            cancelEdit();
            displaySummary();
            loadSummaryVersions(); // Refresh list to show potential title changes
        } else {
            alert('Failed to save summary changes');
        }
    } catch (e) {
        console.error('Error saving summary:', e);
        alert('Error saving: ' + e.message);
    }
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

function toggleSource() {
    const wysiwygArea = document.getElementById('wysiwygArea');
    const sourceTextarea = document.getElementById('sourceTextarea');
    const sourceToggle = document.getElementById('sourceToggle');
    
    isSourceMode = !isSourceMode;
    
    if (isSourceMode) {
        sourceTextarea.value = htmlToMarkdown(wysiwygArea.innerHTML);
        wysiwygArea.style.display = 'none';
        sourceTextarea.style.display = 'block';
        sourceToggle.classList.add('active');
    } else {
        wysiwygArea.innerHTML = marked.parse(sourceTextarea.value);
        sourceTextarea.style.display = 'none';
        wysiwygArea.style.display = 'block';
        sourceToggle.classList.remove('active');
    }
}

function execCmd(command, value = null) {
    document.execCommand(command, false, value);
    const area = document.getElementById('wysiwygArea');
    if (area) area.focus();
}

function insertTableWysiwyg() {
    const area = document.getElementById('wysiwygArea');
    if (area) area.focus();
    const html = '<table><thead><tr><th>Header 1</th><th>Header 2</th><th>Header 3</th></tr></thead><tbody><tr><td>Cell 1</td><td>Cell 2</td><td>Cell 3</td></tr><tr><td>Cell 4</td><td>Cell 5</td><td>Cell 6</td></tr></tbody></table><p><br></p>';
    document.execCommand('insertHTML', false, html);
}

function insertCodeBlock() {
    const area = document.getElementById('wysiwygArea');
    if (area) area.focus();
    const html = '<pre><code>// your code here</code></pre><p><br></p>';
    document.execCommand('insertHTML', false, html);
}

// Simple HTML to Markdown converter for the editor
function htmlToMarkdown(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    
    let markdown = html
        .replace(/<h1>(.*?)<\/h1>/gi, '# $1\n\n')
        .replace(/<h2>(.*?)<\/h2>/gi, '## $1\n\n')
        .replace(/<h3>(.*?)<\/h3>/gi, '### $1\n\n')
        .replace(/<b>(.*?)<\/b>/gi, '**$1**')
        .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
        .replace(/<i>(.*?)<\/i>/gi, '*$1*')
        .replace(/<em>(.*?)<\/em>/gi, '*$1*')
        .replace(/<u>(.*?)<\/u>/gi, '<ins>$1</ins>')
        .replace(/<s>(.*?)<\/s>/gi, '~~$1~~')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<p>(.*?)<\/p>/gi, '$1\n\n')
        .replace(/<ul>([\s\S]*?)<\/ul>/gi, (match, p1) => p1.replace(/<li>(.*?)<\/li>/gi, '* $1\n') + '\n')
        .replace(/<ol>([\s\S]*?)<\/ol>/gi, (match, p1) => {
            let i = 1;
            return p1.replace(/<li>(.*?)<\/li>/gi, () => `${i++}. $1\n`) + '\n';
        });
        
    // Basic table conversion
    const tables = temp.querySelectorAll('table');
    tables.forEach(table => {
        let tableMd = '\n';
        const rows = table.querySelectorAll('tr');
        rows.forEach((row, idx) => {
            const cols = row.querySelectorAll('td, th');
            tableMd += '| ' + Array.from(cols).map(c => c.innerText.trim()).join(' | ') + ' |\n';
            if (idx === 0) {
                tableMd += '| ' + Array.from(cols).map(() => '---').join(' | ') + ' |\n';
            }
        });
        markdown += tableMd + '\n';
    });

    return markdown.trim();
}

function toggleBlockquote() { execCmd('formatBlock', 'blockquote'); }

// Empty stubs for table operations to prevent errors if buttons are clicked
// Real table editing logic is complex and usually requires a dedicated library or more code
function insertHtmlRow(pos) { alert('Row insertion is limited in summary editor'); }
function insertHtmlCol(pos) { alert('Column insertion is limited in summary editor'); }
function deleteHtmlRow() { alert('Row deletion is limited in summary editor'); }
function deleteHtmlCol() { alert('Column deletion is limited in summary editor'); }
function deleteHtmlTable() { alert('Table deletion is limited in summary editor'); }
function mergeHtmlCells() { alert('Cell merging is limited in summary editor'); }
