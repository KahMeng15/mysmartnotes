const API_URL = '';
const token = localStorage.getItem('token');
const urlParams = new URLSearchParams(window.location.search);
const subjectId = urlParams.get('id');

let allLectures = [];
let currentSubject = null;

window.addEventListener('load', () => {
    if (!token) window.location.href = '/login';
    if (!subjectId) {
        alert('No subject specified');
        window.location.href = 'notes.html';
        return;
    }
    loadSubjectDetails();
    loadLectures();
});

async function loadSubjectDetails() {
    try {
        // Determine group context? We can just fetch subjects to find this one.
        const response = await fetch(`${API_URL}/subjects`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const subjects = await response.json();
            currentSubject = subjects.find(s => s.id == subjectId);
            if (currentSubject) {
                document.getElementById('subjectTitle').textContent = currentSubject.name;
                document.getElementById('subjectDesc').textContent = currentSubject.description || '';

                // Update breadcrumb with group info if available
                if (currentSubject.group_id) {
                    // Fetch group details
                    const groupsRes = await fetch(`${API_URL}/groups`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
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

async function loadLectures() {
    try {
        const response = await fetch(`${API_URL}/lectures?subject_id=${subjectId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            let data = await response.json();
            allLectures = data.filter(l => l.subject_id == subjectId);
            displayLectures(allLectures);
        }
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('lecturesList').innerHTML = '<div class="empty-state">Error loading lectures</div>';
    }
}

function filterLectures() {
    let filtered = allLectures;
    const search = document.getElementById('searchInput').value.toLowerCase();
    if (search) {
        filtered = filtered.filter(l => l.title.toLowerCase().includes(search));
    }

    const sort = document.getElementById('sortSelect').value;
    if (sort === 'recent') {
        filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (sort === 'oldest') {
        filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else if (sort === 'name') {
        filtered.sort((a, b) => a.title.localeCompare(b.title));
    }

    displayLectures(filtered);
}

function displayLectures(lectures) {
    const listContainer = document.getElementById('lecturesList');
    if (!lectures || lectures.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <i class="ph ph-files" style="font-size: 48px; margin-bottom: 1rem;"></i>
                <p>No lectures found in this subject.</p>
                <button onclick="goToUpload()" class="btn btn-primary" style="margin-top: 1rem;">Upload First Lecture</button>
            </div>
        `;
        return;
    }

    listContainer.innerHTML = lectures.map(lecture => `
        <div class="lecture-item">
            <div class="lecture-info" onclick="openLecture('${lecture.id}')" style="cursor: pointer;">
                <div class="lecture-icon">
                    <i class="ph ${getIconForType(lecture.file_type)}"></i>
                </div>
                <div class="lecture-details">
                    <h4>${lecture.title}</h4>
                    <p>${new Date(lecture.created_at).toLocaleDateString()} • ${lecture.file_type ? lecture.file_type.split('/')[1].toUpperCase() : 'FILE'}</p>
                </div>
            </div>
            <div class="lecture-actions">
                <button onclick="openLecture('${lecture.id}')" class="btn btn-outline btn-small">
                    View
                </button>
                <button onclick="deleteLecture('${lecture.id}')" class="btn btn-outline btn-small" style="color: var(--color-error);">
                    <i class="ph ph-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function getIconForType(mimeType) {
    if (!mimeType) return 'ph-file';
    if (mimeType.includes('pdf')) return 'ph-file-pdf';
    if (mimeType.includes('image')) return 'ph-file-image';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'ph-presentation';
    return 'ph-file-text';
}

function openLecture(id) {
    window.location.href = `/note/${id}`;
}

function goToUpload() {
    // Need group info? We can get it from currentSubject.group_id
    let url = `upload.html?subject_id=${subjectId}`;
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
                'Authorization': `Bearer ${token}`,
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
            showSuccessModal('Subject Updated', 'Your subject has been updated successfully!');
            // Set up done button to reload details
            const successModal = document.getElementById('successModal');
            const handleDone = () => {
                closeSuccessModal();
                loadSubjectDetails();
            };
            const doneBtn = successModal.querySelector('.btn-save');
            if (doneBtn) {
                doneBtn.onclick = handleDone;
            }
        } else {
            alert('Failed to update subject');
        }
    } catch (err) {
        alert('Error updating subject');
    }
}

async function deleteSubject() {
    showConfirmModal('Are you sure you want to delete this subject? All lectures within it will also be deleted.', async function() {
        try {
            const response = await fetch(`${API_URL}/subjects/${subjectId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                showSuccessModal('Subject Deleted', 'The subject has been deleted successfully!');
                // Redirect after modal is closed
                const successModal = document.getElementById('successModal');
                const handleDone = () => {
                    window.location.href = 'mynotes.html';
                };
                const doneBtn = successModal.querySelector('.btn-save');
                if (doneBtn) {
                    doneBtn.onclick = handleDone;
                }
            } else {
                alert('Failed to delete subject');
            }
        } catch (error) {
            alert('Error deleting subject');
        }
    });
}

async function deleteLecture(id) {
    showConfirmModal('Delete this lecture?', async function() {
        try {
            const response = await fetch(`${API_URL}/lectures/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                showSuccessModal('Lecture Deleted', 'The lecture has been deleted successfully!');
                // Reload after modal is closed
                const successModal = document.getElementById('successModal');
                const handleDone = () => {
                    loadLectures();
                };
                const doneBtn = successModal.querySelector('.btn-save');
                if (doneBtn) {
                    doneBtn.onclick = handleDone;
                }
            } else {
                alert('Failed to delete lecture');
            }
        } catch (error) {
            alert('Error deleting lecture');
        }
    });
}

function logout() {
    window.logout();
}

// Close modal on outside click
window.onclick = function (event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('active');
    }
}