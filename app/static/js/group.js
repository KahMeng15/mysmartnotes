const API_URL = '';
const token = localStorage.getItem('token');
const urlParams = new URLSearchParams(window.location.search);
const groupId = urlParams.get('id');

let currentGroup = null;
let groupSubjects = [];

window.addEventListener('load', () => {
    if (!token) window.location.href = 'login.html';
    if (!groupId) {
        alert('No group specified');
        window.location.href = 'notes.html';
        return;
    }
    fetchData();
});

async function fetchData() {
    try {
        // Fetch Group Details
        // Since we don't have a single GET /groups/{id} endpoint exposed in API list (only GET /groups), 
        // we fetch all and find. Optimally we should add GET /groups/{id} but this works for now.
        // Wait, checking routers/groups.py in memory: usually standard CRUD.
        // Let's assume we fetch all groups for now to be safe, or try /groups/{id} if implemented.
        // Based on previous `notes.html`, we fetched all.

        const groupsRes = await fetch(`${API_URL}/groups`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (groupsRes.ok) {
            const groups = await groupsRes.json();
            currentGroup = groups.find(g => g.id == groupId);
            if (currentGroup) {
                document.getElementById('groupTitle').textContent = currentGroup.name;
            } else {
                document.getElementById('groupTitle').textContent = 'Group Not Found';
                document.querySelector('.group-actions').style.display = 'none';
                document.getElementById('subjectsGrid').innerHTML = '<div class="empty-state">Group not found.</div>';
                return;
            }
        }

        // Fetch Subjects
        const subjectsRes = await fetch(`${API_URL}/subjects`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (subjectsRes.ok) {
            const allSubjects = await subjectsRes.json();
            groupSubjects = allSubjects.filter(s => s.group_id == groupId);
            renderSubjects(groupSubjects);
        }

    } catch (error) {
        console.error('Error fetching data:', error);
        document.getElementById('subjectsGrid').innerHTML =
            `<div class="empty-state">Error loading details.</div>`;
    }
}

function renderSubjects(subjects) {
    const container = document.getElementById('subjectsGrid');
    if (subjects.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
                <i class="ph ph-files" style="font-size: 48px; margin-bottom: 1rem;"></i>
                <p>No subjects in this group.</p>
                <button onclick="window.location.href='notes.html'" class="btn btn-primary" style="margin-top: 1rem;">Go to Notes to Add Subjects</button>
            </div>
        `;
        return;
    }

    container.innerHTML = subjects.map(s => `
        <div class="subject-card" onclick="openSubject(${s.id})" style="border-left: 4px solid ${s.color || '#593C8F'};">
            <div class="subject-title">${s.name}</div>
            <p style="color: var(--color-gray); font-size: 0.9rem; margin-bottom: 1rem; flex: 1;">
                ${s.description || 'No description'}
            </p>
            <div class="subject-meta">
                <i class="ph ph-files"></i> View Lectures
            </div>
        </div>
    `).join('');
}

// --- Filters ---
function filterSubjects() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    let filtered = groupSubjects.filter(s => s.name.toLowerCase().includes(query));

    // Sort
    const sortType = document.getElementById('sortSelect').value;
    if (sortType === 'name') {
        filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortType === 'recent') {
        filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    renderSubjects(filtered);
}

function sortSubjects() {
    filterSubjects();
}

function openSubject(id) {
    window.location.href = `subject.html?id=${id}`;
}

// --- Actions ---
function goToUpload() {
    window.location.href = `upload.html?group_id=${groupId}`;
}

function openEditGroupModal() {
    if (!currentGroup) {
        alert('Error: Group data not loaded properly. Please refresh.');
        return;
    }
    const modal = document.getElementById('editGroupModal');
    if (modal) {
        modal.classList.add('active');
        document.getElementById('editGroupNameInput').value = currentGroup.name;
    }
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

async function handleEditGroup(e) {
    e.preventDefault();
    const name = document.getElementById('editGroupNameInput').value;
    try {
        const res = await fetch(`${API_URL}/groups/${groupId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name })
        });
        if (res.ok) {
            closeModal('editGroupModal');
            currentGroup.name = name;
            document.getElementById('groupTitle').textContent = name;
            // Optional: trim query params or reload to reflect? Title update is enough.
        } else {
            alert('Failed to update group');
        }
    } catch (err) {
        alert('Error updating group');
    }
}

async function deleteGroup() {
    if (!confirm("Delete this group? Subjects in it will be deleted or ungrouped.")) return;
    try {
        const res = await fetch(`${API_URL}/groups/${groupId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            window.location.href = 'mynotes.html';
        }
    } catch (err) {
        alert('Failed to delete group');
    }
}

function logout() {
    if (confirm('Logout?')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'login.html';
    }
}

// Close modal on outside click
window.onclick = function (event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('active');
    }
}
