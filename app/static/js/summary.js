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
    const backToNoteBtn = document.getElementById('backToNoteBtn');
    if (backToNoteBtn) backToNoteBtn.onclick = () => window.location.href = `/note/${lectureId}`;
    
    const sidebarBackBtn = document.getElementById('sidebarBackBtn');
    if (sidebarBackBtn) sidebarBackBtn.onclick = () => window.location.href = `/note/${lectureId}`;

    await loadSummary();
    await loadSummaryVersions();
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
            if (!list) return;
            
            if (summaries.length === 0) {
                list.innerHTML = '<div class="empty-state" style="padding: var(--spacing-md); font-size: var(--font-size-xs);">No summaries yet</div>';
                return;
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
        }
    } catch (e) { console.error('Error loading versions:', e); }
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
                currentVersionId = docId;
                displaySummary();
                loadSummaryVersions();
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
            await loadSummaryVersions();
            await loadSummary();
        }
    } catch (e) { 
        alert('Error deleting summary version: ' + e.message);
    }
}

async function loadSummary() {
    try {
        const res = await fetch(`/documents/summary`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ lecture_id: lectureId })
        });

        if (res.ok) {
            const data = await res.json();
            summaryData = data.content;
            quickreadData = data.quickread || null;
            currentSummaryMode = data.mode || 'elaborate';
            currentSummaryFormat = data.output_format || 'sentence';
            currentProcessingMethod = data.processing_method || 'whole';
            currentVersionId = data.id;
            displaySummary();
            
            // Also load note metadata for breadcrumbs
            loadNoteMetadata();
        } else {
            // If no summary exists, show options to generate one
            showSummaryOptions();
            document.getElementById('summaryText').innerHTML = '<p style="text-align:center; color:var(--color-gray); padding:20px;">No summary found. Click "Re-generate" or the button below to create one.</p>';
        }
    } catch (e) {
        console.error('Error loading summary:', e);
        document.getElementById('summaryText').innerHTML = '<p class="error">Error loading summary.</p>';
    }
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
            
            // Update breadcrumbs and titles
            if (note.subject) {
                const groupLink = document.getElementById('metaGroup');
                const subjectLink = document.getElementById('metaSubject');
                const contentSubjectName = document.getElementById('contentSubjectName');
                
                if (contentSubjectName) contentSubjectName.textContent = note.title;
                
                if (note.subject.group && note.subject.group.name) {
                    groupLink.textContent = note.subject.group.name;
                    groupLink.href = `/dashboard?group=${note.subject.group.id}`;
                } else {
                    groupLink.textContent = "My Notes";
                    groupLink.href = `/dashboard`;
                }
                
                subjectLink.textContent = note.subject.name;
                subjectLink.href = `/subject.html?id=${note.subject.id}`;
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
            currentVersionId = data.id;
            
            setTimeout(() => {
                document.getElementById('summaryProgressModal').classList.remove('active');
                displaySummary();
                loadSummaryVersions();
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
