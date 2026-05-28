// Summary Page Logic
let lectureId = null;
let summaryData = null;
let quickreadData = null;
let currentSummaryMode = localStorage.getItem('globalAiMode') || 'normal';
let currentSummaryFormat = localStorage.getItem('globalOutputFormat') || 'sentence';
let isRegeneratingSummary = false;
let currentProcessingMethod = 'whole';
let currentVersionId = null;
let currentVersionNum = null;
let deleteConfirmVersionId = null;
let currentSplitLevel = null;
let currentProcessingTime = null;
let currentProcessingTimeMs = null;
let currentAIModel = null;
let currentNoteTitleForBreadcrumb = null;
let isUserEdited = false;
let isEditMode = false;
let isSourceMode = false;
let selectedExportFormat = 'pdf';

const SUMMARY_MODE_META = {
    quick: { label: 'Quick', icon: 'ph-lightning' },
    simple: { label: 'Simple', icon: 'ph-text-a-underline' },
    normal: { label: 'Normal', icon: 'ph-stack' },
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
    // Extract lectureId from URL path: /note/{id}/summary
    const pathParts = window.location.pathname.split('/');
    lectureId = pathParts[2]; 
    let initialSummaryId = pathParts[4] || null; // /note/{id}/summary/{summary_id}
    const shouldEdit = pathParts[5] === 'edit';

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
    const savedNested = localStorage.getItem('summaryShowNested');
    
    if (savedObjectives !== null) {
        const toggleObjectives = document.getElementById('toggleObjectives');
        if (toggleObjectives) toggleObjectives.checked = savedObjectives === 'true';
    }
    
    if (savedQuickread !== null) {
        const toggleQuickread = document.getElementById('toggleQuickread');
        if (toggleQuickread) toggleQuickread.checked = savedQuickread === 'true';
    }

    if (savedNested !== null) {
        const toggleNested = document.getElementById('toggleNested');
        if (toggleNested) toggleNested.checked = savedNested === 'true';
    } else {
        // Default to false (hidden) if not set
        const toggleNested = document.getElementById('toggleNested');
        if (toggleNested) toggleNested.checked = false;
    }

    // Load initial data
    await loadNoteMetadata();
    const summaries = await loadSummaryVersions();
    
    if (summaries && summaries.length > 0) {
        let versionToLoad = null;
        
        if (initialSummaryId) {
            if (initialSummaryId.startsWith('v')) {
                const vNum = parseInt(initialSummaryId.substring(1));
                versionToLoad = summaries.find(s => s.version === vNum);
            } else {
                versionToLoad = summaries.find(s => s.id == initialSummaryId);
            }
        }
        
        if (!versionToLoad) {
            // Try to load last selected version
            const lastVersionId = localStorage.getItem(`lastSummaryVersion_${lectureId}`);
            versionToLoad = summaries[0];
            if (lastVersionId) {
                const found = summaries.find(s => s.id == lastVersionId);
                if (found) versionToLoad = found;
            }
        }
        
        await loadSummaryVersion(versionToLoad.id, false);
        
        if (shouldEdit && currentVersionId) {
            toggleEdit();
        }
    } else {
        showNoSummaryUI();
        showSummaryOptions(false);
    }
});

function updateURL() {
    let url = `/note/${lectureId}/summary`;
    if (currentVersionId && currentVersionNum) {
        url += `/v${currentVersionNum}`;
        if (isEditMode) {
            url += `/edit`;
        }
    }
    if (window.location.pathname !== url) {
        history.pushState(null, '', url);
    }
}

async function loadSummaryVersions() {
    try {
        const res = await fetch(`/summaries?lecture_id=${lectureId}`);
        if (res.ok) {
            const docs = await res.json();
            const summaries = docs.filter(d => d.summary_type === 'summary').sort((a, b) => b.version - a.version);
            const list = document.getElementById('summaryList');
            if (!list) return summaries;

            // Check if there is an active summary task for this lecture
            const activeTasks = window.ProgressManager ? window.ProgressManager.activeTasks : new Map();
            const summaryTask = Array.from(activeTasks.values()).find(t => 
                t.task_type === 'summary_generation' && t.input_data?.kwargs?.lecture_id === lectureId
            );
            
            let processingItem = '';
            if (summaryTask && !['completed', 'failed'].includes(summaryTask.status)) {
                const isProcessingActive = !currentVersionId;
                processingItem = `
                    <div class="version-item ${isProcessingActive ? 'active' : ''} processing" onclick="showNoSummaryUI(); currentVersionId=null; loadSummaryVersions();" style="opacity: 0.7; cursor: pointer;">
                        <div style="flex: 1; min-width: 0;">
                            <div class="version-title">
                                <i class="ph ph-spinner ph-spin" style="margin-right: 6px;"></i>
                                Processing Summary
                            </div>
                            <div class="version-meta">${summaryTask.progress}% complete</div>
                        </div>
                    </div>
                `;
            }
            
            if (summaries.length === 0 && !processingItem) {
                list.innerHTML = '<div class="empty-state" style="padding: var(--spacing-md); font-size: var(--font-size-xs);">No summaries yet</div>';
                return summaries;
            }
            
            const versionsHtml = summaries.map(function(s) {
                const isSelected = (currentVersionId === s.id);
                var label = s.title;
                if (s.is_user_edited) {
                    label += ' (Edited)';
                }
                var dateString = window.formatDate ? window.formatDate(s.created_at) : s.created_at;
                
                return '<div class="version-item ' + (isSelected ? 'active' : '') + '" onclick="loadSummaryVersion(\'' + s.id + '\')">' +
                        '<div style="flex: 1; min-width: 0;">' +
                            '<div class="version-title">' + label + '</div>' +
                            '<div class="version-meta">' + dateString + '</div>' +
                        '</div>' +
                        '<button class="version-delete" onclick="event.stopPropagation(); showDeleteConfirm(\'' + s.id + '\')">' +
                            '<i class="ph ph-trash"></i>' +
                        '</button>' +
                    '</div>';
            }).join('');

            list.innerHTML = processingItem + versionsHtml;
            return summaries;
        }
    } catch (e) { 
        console.error('Error loading versions:', e); 
    }
    return [];
}

async function loadSummaryVersion(docId, pushURL = true) {
    if (isEditMode) {
        showEditWarningModal();
        return;
    }
    try {
        let fetchUrl = `/summaries/${docId}`;
        if (docId.toString().startsWith('v')) {
            fetchUrl += `?lecture_id=${lectureId}`;
        }
        
        const res = await fetch(fetchUrl);
        if (res.ok) {
            const data = await res.json();
            if (data.content) {
                // Save last selected version ID
                localStorage.setItem(`lastSummaryVersion_${lectureId}`, data.id);
                
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
                currentVersionNum = data.version;
                displaySummary();
                loadSummaryVersions();
                
                if (pushURL) updateURL();
                
                // Update breadcrumb when switching version
                loadNoteMetadata();
            }
        }
    } catch (e) { console.error('Error loading version:', e); }
}

function showEditWarningModal() {
    document.getElementById('editWarningModal').classList.add('active');
}

function closeEditWarningModal() {
    document.getElementById('editWarningModal').classList.remove('active');
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
        const res = await fetch(`/summaries/${docIdToDelete}`, {
            method: 'DELETE'
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

    // Check if there is an active summary task for this lecture
    const activeTasks = window.ProgressManager ? window.ProgressManager.activeTasks : new Map();
    const summaryTask = Array.from(activeTasks.values()).find(t => 
        t.task_type === 'summary_generation' && t.input_data?.kwargs?.lecture_id === lectureId
    );

    if (summaryTask && (summaryTask.status === 'processing' || summaryTask.status === 'pending' || summaryTask.status === 'running')) {
        // Show skeleton loading
        if (summaryContainer) summaryContainer.classList.remove('flex-centering-active');
        summaryText.style.display = 'block';
        summaryText.style.flex = 'none';
        if (noteHeader) noteHeader.style.display = 'block';

        summaryText.innerHTML = `
            <div class="skeleton-container" style="padding: 0;">
                <div class="skeleton-line" style="width: 40%; height: 24px; margin-bottom: 24px;"></div>
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

        // Update on-page progress container
        const progressContainer = document.getElementById('summaryProgressContainer');
        if (progressContainer) progressContainer.style.display = 'block';
        updateSummaryProgress(summaryTask.progress, summaryTask.message || 'Summarizing note content', 'Processing');
        
        return;
    }

    // Remove loading bar if present
    const bar = document.getElementById('summaryLoadingBar');
    if (bar) bar.remove();
    
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

    resetSummaryDetails();
}


// Listen for task updates to refresh the summary content in real-time
window.addEventListener('taskUpdate', (e) => {
    const task = e.detail;
    if (task.task_type === 'summary_generation' && task.input_data?.kwargs?.lecture_id === lectureId) {
        // Update on-page progress
        updateSummaryProgress(task.progress, task.message || 'Summarizing note content', 'Processing');
        
        // Update sidebar version list to show progress there too
        loadSummaryVersions();

        if (task.status === 'completed') {
            const container = document.getElementById('summaryProgressContainer');
            if (container) container.style.display = 'none';
            
            // Reload summaries and load the latest
            loadSummaryVersions().then(summaries => {
                if (summaries && summaries.length > 0) {
                    loadSummaryVersion(summaries[0].id, false);
                }
            });
        } else if (task.status === 'failed') {
            const container = document.getElementById('summaryProgressContainer');
            if (container) container.style.display = 'none';
            showNoSummaryUI();
        }
    }
});

function resetSummaryDetails() {
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
        const res = await fetch(`/lectures/${lectureId}`);
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
                    const summaryModeLabel = SUMMARY_MODE_META[currentSummaryMode]?.label || 'Summary';
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
        const modeLabel = SUMMARY_MODE_META[currentSummaryMode]?.label || currentSummaryMode;
        const modeIcon = SUMMARY_MODE_META[currentSummaryMode]?.icon || 'ph-lightbulb';
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
    const savedNested = localStorage.getItem('summaryShowNested');

    if (toggleObjectives && savedObjectives !== null) {
        toggleObjectives.checked = savedObjectives === 'true';
    }
    if (toggleQuickread && savedQuickread !== null) {
        toggleQuickread.checked = savedQuickread === 'true';
    }
    if (toggleNested) {
        if (savedNested !== null) {
            toggleNested.checked = savedNested === 'true';
        } else {
            toggleNested.checked = false; // Default
        }
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
        detailsFormat.textContent = formatLabel || '—';
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
    localStorage.setItem('globalAiMode', mode);
}

function setSummaryFormat(format) {
    currentSummaryFormat = format;
    document.querySelectorAll('#summaryOutputBar .mode-pill').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.format === format);
    });
    localStorage.setItem('globalOutputFormat', format);
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
    } else if (elementId === 'nestedSummary') {
        if (saveToStorage) localStorage.setItem('summaryShowNested', show);
        // show=true means user wants to SEE them. show=false means user wants to HIDE them.
        const shouldShow = show; 
        const summaryPatterns = [
            /summary/i,
            /overview/i
        ];

        headers.forEach(header => {
            // Check if it's an H2 as requested, or contains the patterns
            const isH2 = header.tagName === 'H2';
            const text = header.textContent.trim();
            
            let matches = false;
            for (const pattern of summaryPatterns) {
                if (pattern.test(text)) {
                    matches = true;
                    break;
                }
            }

            if (matches) {
                // Apply visibility
                header.style.display = shouldShow ? '' : 'none';
                let current = header.nextElementSibling;
                while (current && !current.matches('h2, h3, h4, h5')) {
                    current.style.display = shouldShow ? '' : 'none';
                    current = current.nextElementSibling;
                }
            }
        });
    }
}

function hideRedundantSections() {
    // Apply current checkbox states to hide/show sections
    const toggleObjectives = document.getElementById('toggleObjectives');
    const toggleQuickread = document.getElementById('toggleQuickread');
    const toggleNested = document.getElementById('toggleNested');
    
    if (toggleObjectives) {
        toggleElement('objectivesSection', toggleObjectives.checked, false);
    }
    if (toggleQuickread) {
        toggleElement('quickreadSection', toggleQuickread.checked, false);
    }
    if (toggleNested) {
        toggleElement('nestedSummary', toggleNested.checked, false);
    }
}

function updateSummaryProgress(percent, message, label) {
    const container = document.getElementById('summaryProgressContainer');
    const fill = document.getElementById('summaryProgressFill');
    const percentText = document.getElementById('summaryProgressPercent');
    const msgText = document.getElementById('summaryProgressMessage');
    
    if (container) container.style.display = 'block';
    if (fill) fill.style.width = `${percent}%`;
    if (percentText) percentText.textContent = `${percent}%`;
    if (msgText && message) msgText.textContent = message;
}

async function generateSummary() {
    const method = document.getElementById('summaryProcessMethod').value;
    const splitLevel = document.getElementById('summarySplitLevel').value;
    
    closeSummaryModal();
    // Show on-page progress instead of modal
    const container = document.getElementById('summaryProgressContainer');
    if (container) container.style.display = 'block';
    updateSummaryProgress(0, 'Initializing AI model', 'Working');
    
    let currentPercent = 5;
    let progressInterval = setInterval(() => {
        // Only auto-increment if we haven't reached the "wait for AI" threshold
        // OR if the real progress is already ahead of us
        if (currentPercent < 85) {
            currentPercent += Math.random() * 3;
            updateSummaryProgress(Math.floor(currentPercent), 'Summarizing note content', 'Processing');
        }
    }, 2000);

    try {
        const res = await fetch('/summaries/summary', {
            method: 'POST',
            headers: {
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

        if (res.ok) {
            const data = await res.json();

            if (data.task_id) {
                console.log(`[Summary] Task submitted. Task ID: ${data.task_id}`);
                
                // Switch UI to processing mode immediately
                showNoSummaryUI();
                loadSummaryVersions();

                // Background task submitted, wait for WebSocket
                WSManager.subscribe(data.task_id, (update) => {
                    console.log(`[Summary] WS Update for ${data.task_id}:`, update);
                    if (update.progress !== undefined) {
                        // Synchronize our local progress with the real one from the server
                        currentPercent = update.progress;
                        updateSummaryProgress(Math.floor(currentPercent), update.message || 'Summarizing note content', 'Processing');
                    }

                    if (update.status === 'completed') {
                        clearInterval(progressInterval);
                        updateSummaryProgress(100, 'Complete!', 'Done');

                        const result = update.result;
                        summaryData = result.content;
                        quickreadData = result.quickread || null;
                        currentSummaryMode = result.mode || 'elaborate';
                        currentSummaryFormat = result.output_format || 'sentence';
                        currentProcessingMethod = result.processing_method || 'whole';
                        currentSplitLevel = result.split_level || null;
                        currentProcessingTime = result.processing_time || null;
                        currentProcessingTimeMs = result.processing_time_ms || null;
                        currentAIModel = result.model || null;
                        isUserEdited = result.is_user_edited || false;
                        currentVersionId = result.id;

                        setTimeout(() => {
                            if (container) container.style.display = 'none';
                            displaySummary();
                            loadSummaryVersions();
                            loadNoteMetadata();
                            isRegeneratingSummary = false;
                        }, 600);
                    } else if (update.status === 'failed') {
                        clearInterval(progressInterval);
                        if (container) container.style.display = 'none';
                        alert('Summary generation failed: ' + (update.error || 'Unknown error'));
                    }
                });
                return; // Wait for WS
            }

            clearInterval(progressInterval);
            updateSummaryProgress(100, 'Complete!', 'Done');
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
                if (container) container.style.display = 'none';
                displaySummary();
                loadSummaryVersions();
                loadNoteMetadata();
                isRegeneratingSummary = false;
            }, 600);
        } else {
            clearInterval(progressInterval);
            if (container) container.style.display = 'none';
            alert('Failed to generate summary');
        }    } catch (e) {
        clearInterval(progressInterval);
        if (container) container.style.display = 'none';
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
    const quickreadContent = document.getElementById('quickreadContent');
    const quickreadContainer = document.getElementById('quickreadContainer');
    
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
        if (wysiwygArea) {
            wysiwygArea.innerHTML = marked.parse(summaryData || '');
            wysiwygArea.classList.add('markdown-content');
        }
        if (sourceTextarea) {
            sourceTextarea.value = summaryData || '';
            // Handle resizing if switched to source
            if (!sourceTextarea.dataset.resizeBound) {
                sourceTextarea.addEventListener('input', autoResizeTextarea);
                sourceTextarea.dataset.resizeBound = 'true';
            }
        }
        
        // Enable Quickread editing if available
        if (quickreadContent && quickreadContainer && quickreadContainer.style.display !== 'none') {
            quickreadContent.contentEditable = 'true';
            quickreadContent.classList.add('quickread-editor-active');
        }
        
        isSourceMode = false;
        if (sourceTextarea) sourceTextarea.style.display = 'none';
        if (wysiwygArea) wysiwygArea.style.display = 'block';
        updateURL();
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
    const quickreadContent = document.getElementById('quickreadContent');
    
    if (summaryContainer) summaryContainer.classList.remove('flex-centering-active');
    
    if (quickreadContent) {
        quickreadContent.contentEditable = 'false';
        quickreadContent.classList.remove('quickread-editor-active');
    }

    if (viewContainer) viewContainer.style.display = 'block';
    if (editorContainer) {
        editorContainer.style.display = 'none';
        editorContainer.classList.remove('active');
    }
    if (editBtn) {
        editBtn.classList.remove('active');
        editBtn.innerHTML = '<i class="ph ph-pencil-simple"></i> <span>Edit</span>';
    }
    updateURL();
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
    const quickreadContent = document.getElementById('quickreadContent');
    
    let newContent = isSourceMode ? sourceTextarea.value : htmlToMarkdown(wysiwygArea.innerHTML);
    let newQuickread = quickreadContent ? htmlToMarkdown(quickreadContent.innerHTML) : null;
    
    try {
        const res = await fetch(`/summaries/${currentVersionId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                content: newContent,
                quickread: newQuickread
            })
        });
        
        if (res.ok) {
            const data = await res.json();
            summaryData = data.content;
            quickreadData = data.quickread || null;
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
        
        // Auto resize after switch
        autoResizeTextarea();
        if (!sourceTextarea.dataset.resizeBound) {
            sourceTextarea.addEventListener('input', autoResizeTextarea);
            sourceTextarea.dataset.resizeBound = 'true';
        }
    } else {
        wysiwygArea.innerHTML = marked.parse(sourceTextarea.value);
        wysiwygArea.classList.add('markdown-content');
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
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return nodeToMd(doc.body).trim();
}

function nodeToMd(node) {
    let result = '';
    if (!node) return result;
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
                default: result += inner;
            }
        }
    }
    return result;
}

function autoResizeTextarea() {
    const sourceTextarea = document.getElementById('sourceTextarea');
    if (!sourceTextarea) return;
    sourceTextarea.style.height = 'auto';
    sourceTextarea.style.height = sourceTextarea.scrollHeight + 'px';
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

// --- Export Logic ---

async function exportNote() {
    if (!currentVersionId) {
        alert('Please select or generate a summary first.');
        return;
    }
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

function updateExportProgress(text, percent) {
    const pText = document.getElementById('exportProgressText');
    const pPercent = document.getElementById('exportProgressPercent');
    const pBar = document.getElementById('exportProgressBar');
    if (pText) pText.textContent = text;
    if (pPercent) pPercent.textContent = `${percent}%`;
    if (pBar) pBar.style.width = `${percent}%`;
}

async function doExport() {
    const format = selectedExportFormat;
    const templateSelect = document.getElementById('exportTemplateSelect');
    const templateId = templateSelect.value || null;

    // Show progress
    document.getElementById('exportProgress').style.display = 'block';
    document.getElementById('exportSubmitBtn').disabled = true;
    updateExportProgress('Preparing export...', 5);

    // Simulate progress
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
        const payload = { format: format };
        if (templateId) payload.template_id = templateId;

        const response = await fetch(`/summaries/${currentVersionId}/export`, {
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
                a.download = data.filename || `summary.${format}`;
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
            alert('Export failed: ' + (error.detail || 'Unknown error'));
            document.getElementById('exportSubmitBtn').disabled = false;
        }
    } catch (e) {
        console.error('Export error:', e);
        alert('Error exporting: ' + e.message);
        document.getElementById('exportSubmitBtn').disabled = false;
    }
}

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

// Restore action collapsed state
if (localStorage.getItem('actionCollapsed') === 'true') {
    document.addEventListener('DOMContentLoaded', () => {
        const layout = document.querySelector('.app-layout');
        if (layout) {
            layout.classList.add('action-collapsed');
            const icon = document.getElementById('actionToggleIcon');
            if (icon) icon.className = 'ph ph-caret-left';
        }
    });
}
