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
let currentNoteTitleForBreadcrumb = null;

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

    // Load initial data
    await loadNoteMetadata();
    const summaries = await loadSummaryVersions();
    
    if (summaries && summaries.length > 0) {
        await loadSummaryVersion(summaries[0].id);
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
    try {
        const res = await fetch(`/documents/${docId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            if (data.content) {
                summaryData = data.content;
                quickreadData = data.quickread || null;
                currentSummaryMode = data.mode || 'elaborate';
                currentSummaryFormat = data.output_format || 'sentence';
                currentProcessingMethod = data.processing_method || 'whole';
                currentSplitLevel = data.split_level || null;
                currentProcessingTime = data.processing_time || null;
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
    if (!summaryText) return;
    
    summaryText.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 400px; padding: 40px; text-align: center;">
            <i class="ph ph-sparkle" style="font-size: 3rem; color: var(--color-primary); margin-bottom: 16px;"></i>
            <h2 style="margin-bottom: 8px; color: var(--color-dark);">No Summary Yet</h2>
            <p style="color: var(--color-gray); margin-bottom: 24px; max-width: 300px;">
                Create your first AI-generated summary to quickly understand the key points of your note.
            </p>
            <button class="btn btn-primary" onclick="showSummaryOptions(false)" style="padding: 10px 20px;">
                <i class="ph ph-plus" style="margin-right: 8px;"></i> Generate Summary
            </button>
        </div>
    `;
    
    // Also reset detail values
    const details = ['detailsProcessingMode', 'detailsFormat', 'detailsProcessingTime'];
    details.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '—';
    });
    const divItem = document.getElementById('detailsDividerItem');
    if (divItem) divItem.style.display = 'none';
    
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
                
                // Add summary mode to breadcrumb - use class instead of inline styles
                const summaryModeLabel = MODE_META[currentSummaryMode]?.label || 'Summary';
                breadcrumbHTML += `<a class="note-nav-crumb-link">${summaryModeLabel} in ${FORMAT_META[currentSummaryFormat]?.label || 'Summary'}</a>`;
                
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
    const quickreadContainer = document.getElementById('quickreadContainer');
    const displayAiModePill = document.getElementById('displayAiModePill');
    const displayAiFormatPill = document.getElementById('displayAiFormatPill');
    
    if (!summaryData) return;
    
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
    
    // Update Details Section
    updateDetailsSection();
    
    try {
        summaryText.innerHTML = marked.parse(summaryData);
    } catch (e) {
        summaryText.innerHTML = summaryData.replace(/\n/g, '<br>');
    }
    
    // Show Quickread at the top if it exists (section-by-section processing)
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
    
    // Apply current visibility settings to hide sections from the raw content
    hideRedundantSections();
}

function formatProcessingTime(seconds) {
    if (!seconds && seconds !== 0) return '—';
    if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
}

function updateDetailsSection() {
    const detailsProcessingMode = document.getElementById('detailsProcessingMode');
    const detailsDividerItem = document.getElementById('detailsDividerItem');
    const detailsDivider = document.getElementById('detailsDivider');
    const detailsFormat = document.getElementById('detailsFormat');
    const detailsProcessingTime = document.getElementById('detailsProcessingTime');
    
    if (detailsProcessingMode) {
        const modeText = currentProcessingMethod === 'section' ? 'Section by section' : 'Whole note';
        detailsProcessingMode.textContent = modeText;
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
        detailsProcessingTime.textContent = formatProcessingTime(currentProcessingTime);
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

function toggleElement(elementId, show) {
    // Hide/show sections from the raw note content based on checkbox state
    const summaryText = document.getElementById('summaryText');
    if (!summaryText) return;
    
    const headers = summaryText.querySelectorAll('h2, h3, h4, h5');
    
    if (elementId === 'objectivesSection') {
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
    
    if (toggleObjectives && !toggleObjectives.checked) {
        toggleElement('objectivesSection', false);
    }
    if (toggleQuickread && !toggleQuickread.checked) {
        toggleElement('quickreadSection', false);
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
