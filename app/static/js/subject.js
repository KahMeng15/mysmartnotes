const API_URL = '';
const urlParams = new URLSearchParams(window.location.search);
const subjectId = urlParams.get('id');

let allNotes = [];
let currentSubject = null;

window.toggleSortModal = function(event) {
    event.stopPropagation();
    const modal = document.getElementById('sortModal');
    if (modal) modal.classList.toggle('active');
};

window.updateSortModalUI = function(val) {
    document.querySelectorAll('.sort-option-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.getElementById('opt-' + val);
    if (activeBtn) activeBtn.classList.add('active');
};

window.selectSortOption = function(val, label) {
    const select = document.getElementById('sortSelect');
    if (select) {
        select.value = val;
        select.dispatchEvent(new Event('change'));
    }
    window.updateSortModalUI(val);
    const modal = document.getElementById('sortModal');
    if (modal) modal.classList.remove('active');
};

document.addEventListener('click', (e) => {
    const modal = document.getElementById('sortModal');
    if (modal && modal.classList.contains('active')) {
        if (!modal.contains(e.target) && !e.target.closest('#sortBtn')) {
            modal.classList.remove('active');
        }
    }
});

window.addEventListener('load', () => {
    if (!subjectId) {
        alert('No subject specified');
        window.location.href = 'notes.html';
        return;
    }
    
    // Load saved sort preference
    const savedSort = localStorage.getItem('notes_sort') || 'name';
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.value = savedSort;
    }
    window.updateSortModalUI(savedSort);

    loadSubjectDetails();
    loadNotes();
});

async function loadSubjectDetails() {
    try {
        // Determine group context? We can just fetch subjects to find this one.
        const response = await fetch(`${API_URL}/subjects`);
        if (response.ok) {
            const subjects = await response.json();
            currentSubject = subjects.find(s => s.id == subjectId);
            if (currentSubject) {
                document.getElementById('subjectTitle').textContent = currentSubject.name;
                document.getElementById('subjectDesc').textContent = currentSubject.description || '';

                // Update breadcrumb with group info if available
                if (currentSubject.group_id) {
                    // Fetch group details
                    const groupsRes = await fetch(`${API_URL}/groups`);
                    if (groupsRes.ok) {
                        const groups = await groupsRes.json();
                        const group = groups.find(g => g.id === currentSubject.group_id);
                        if (group) {
                            document.getElementById('groupLink').href = `group.html?id=${group.id}`;
                            document.getElementById('groupLink').textContent = group.name;
                            document.getElementById('breadcrumbGroup').style.display = 'inline';
                        }
                    }
                }
            } else {
                document.getElementById('subjectTitle').textContent = 'Subject Not Found';
                document.querySelector('.group-actions').style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Error loading subject:', error);
    }
}

async function loadNotes() {
    try {
        const response = await fetch(`${API_URL}/notes?subject_id=${subjectId}`);

        if (response.ok) {
            let data = await response.json();
            allNotes = data.filter(l => l.subject_id == subjectId);
            filterNotes(); // Apply sort and display
        }
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('notesList').innerHTML = '<div class="empty-state">Error loading notes</div>';
    }
}

function filterNotes() {
    let filtered = [...allNotes];
    const search = document.getElementById('searchInput').value.toLowerCase();
    if (search) {
        filtered = filtered.filter(l => l.title.toLowerCase().includes(search));
    }

    const sort = document.getElementById('sortSelect').value;
    // Save preference
    localStorage.setItem('notes_sort', sort);

    if (sort === 'recent') {
        filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (sort === 'oldest') {
        filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else if (sort === 'name') {
        filtered.sort((a, b) => a.title.localeCompare(b.title));
    }

    displayNotes(filtered);
}

function displayNotes(notes) {
    const listContainer = document.getElementById('notesList');
    if (!notes || (notes.length === 0 && (!window.ProgressManager || window.ProgressManager.activeTasks.size === 0))) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <i class="ph ph-files" style="font-size: 48px; margin-bottom: 1rem;"></i>
                <p>No notes found in this subject.</p>
                <button onclick="goToUpload()" class="btn btn-primary" style="margin-top: 1rem;">Upload First Note</button>
            </div>
        `;
        return;
    }

    const activeTasks = window.ProgressManager ? window.ProgressManager.activeTasks : new Map();

    listContainer.innerHTML = notes.map(note => {
        const taskId = `ocr_${note.user_id}_${note.id}`;
        const activeTask = activeTasks.get(taskId);
        const isProcessing = activeTask && (activeTask.status === 'processing' || activeTask.status === 'pending' || activeTask.status === 'running');
        const progress = activeTask ? activeTask.progress : 0;
        
        let statusBadge = '';
        if (activeTask) {
            if (activeTask.status === 'pending') {
                statusBadge = '<span class="status-badge status-pending" style="margin-left: 8px; font-size: 10px;">Pending</span>';
            } else if (activeTask.status === 'processing' || activeTask.status === 'running') {
                statusBadge = '<span class="status-badge status-running" style="margin-left: 8px; font-size: 10px;">Processing</span>';
            }
        }

        const fileTypeLabel = getFriendlyFileType(note.file_type);

        return `
            <div class="note-item ${isProcessing ? 'skeleton-card' : ''}" id="note-${note.id}">
                <div class="note-info" onclick="${isProcessing ? '' : `openNote('${note.id}')`}" style="cursor: ${isProcessing ? 'default' : 'pointer'};">
                    <div class="note-icon">
                        <i class="ph ${getIconForType(note.file_type)}"></i>
                    </div>
                    <div class="note-details">
                        <h4 style="display: flex; align-items: center;">${note.title}${statusBadge}</h4>
                        <p>${isProcessing ? 'Processing content...' : `${window.formatDate(note.created_at)} • ${fileTypeLabel}`}</p>
                    </div>
                </div>
                <div class="note-actions">
                    ${isProcessing ? `
                        <div style="font-size: 11px; font-weight: 600; color: var(--color-primary);">${progress}%</div>
                    ` : `
                        <button onclick="openNote('${note.id}')" class="btn btn-view-note" style="background: none; border: none; padding: 8px; color: var(--color-primary); display: flex; align-items: center; justify-content: center; font-size: var(--font-size-lg);" title="View Note">
                            <i class="ph ph-eye"></i>
                        </button>
                        <button onclick="deleteNote('${note.id}')" class="btn btn-delete-note" style="background: none; border: none; padding: 8px; color: var(--color-error); display: flex; align-items: center; justify-content: center; font-size: var(--font-size-lg);" title="Delete Note">
                            <i class="ph ph-trash"></i>
                        </button>
                    `}
                </div>
                ${isProcessing ? `<div class="skeleton-progress-bar" style="width: ${progress}%"></div>` : ''}
            </div>
        `;
    }).join('');
}

function getFriendlyFileType(mimeType) {
    if (!mimeType) return 'FILE';
    const type = mimeType.toLowerCase();
    if (type.includes('pdf')) return 'PDF';
    if (type.includes('presentation') || type.includes('powerpoint') || type.includes('pptx')) return 'PowerPoint';
    if (type.includes('image') || type.includes('png') || type.includes('jpeg')) return 'Image';
    if (type.includes('word') || type.includes('docx')) return 'Word';
    return type.split('/')[1].toUpperCase();
}

// Listen for task updates to refresh the list in real-time
window.addEventListener('taskUpdate', (e) => {
    const task = e.detail;
    if (task.task_id.startsWith('ocr_')) {
        // Find the note element and update its progress bar
        const noteId = task.task_id.split('_').pop();
        const noteEl = document.getElementById(`note-${noteId}`);
        if (noteEl) {
            const bar = noteEl.querySelector('.skeleton-progress-bar');
            const percentText = noteEl.querySelector('.note-actions div');
            if (bar) bar.style.width = task.progress + '%';
            if (percentText) percentText.textContent = task.progress + '%';

            if (task.status === 'completed') {
                // Refresh the whole list once completed to remove skeleton styles
                loadNotes();
            } else if (task.status === 'failed') {
                noteEl.classList.remove('skeleton-card');
                const details = noteEl.querySelector('.note-details p');
                if (details) details.textContent = 'Processing failed';
                if (bar) bar.style.display = 'none';
            }
        }
    }
});

function getIconForType(mimeType) {
    if (!mimeType) return 'ph-file';
    if (mimeType.includes('pdf')) return 'ph-file-pdf';
    if (mimeType.includes('image')) return 'ph-file-image';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'ph-presentation';
    return 'ph-file-text';
}

function openNote(id) {
    window.location.href = `/note/${id}`;
}

function goToUpload() {
    // Need group info? We can get it from currentSubject.group_id
    let url = `/upload?subject_id=${subjectId}`;
    if (currentSubject && currentSubject.group_id) {
        url += `&group_id=${currentSubject.group_id}`;
    }
    window.location.href = url;
}

// --- Edit Subject Logic ---
function openEditSubjectModal() {
    if (!currentSubject) return;
    document.getElementById('editSubjectModal').classList.add('active');
    document.getElementById('editSubjectNameInput').value = currentSubject.name;
    document.getElementById('editSubjectDescInput').value = currentSubject.description || '';
    document.getElementById('editSubjectColorInput').value = currentSubject.color || '#593C8F';
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

async function handleEditSubject(e) {
    e.preventDefault();
    const name = document.getElementById('editSubjectNameInput').value;
    const desc = document.getElementById('editSubjectDescInput').value;
    const color = document.getElementById('editSubjectColorInput').value;

    try {
        const res = await fetch(`${API_URL}/subjects/${subjectId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name,
                description: desc,
                color,
            })
        });

        if (res.ok) {
            closeModal('editSubjectModal');
            showSuccessModal('Subject Updated', 'Your subject has been updated successfully!', () => {
                loadSubjectDetails();
            });
        } else {
            alert('Failed to update subject');
        }
    } catch (err) {
        alert('Error updating subject');
    }
}

async function deleteSubject() {
    showConfirmModal('Are you sure you want to delete this subject? All notes within it will also be deleted.', async function() {
        try {
            const response = await fetch(`${API_URL}/subjects/${subjectId}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                showSuccessModal('Subject Deleted', 'The subject has been deleted successfully!', () => {
                    window.location.href = 'mynotes.html';
                });
            } else {
                alert('Failed to delete subject');
            }
        } catch (error) {
            alert('Error deleting subject');
        }
    });
}

async function deleteNote(id) {
    showConfirmModal('Delete this note?', async function() {
        try {
            const response = await fetch(`${API_URL}/notes/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                showSuccessModal('Note Deleted', 'The note has been deleted successfully!', () => {
                    loadNotes();
                });
            } else {
                alert('Failed to delete note');
            }
        } catch (error) {
            alert('Error deleting note');
        }
    });
}



// Close modal on outside click
window.onclick = function (event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('active');
    }
}