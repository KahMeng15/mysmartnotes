// Dashboard functionality
const API_URL = '';

// Check authentication on page load
window.addEventListener('load', async () => {
    loadUserInfo();
    loadDashboardSummary();
    await loadSubjects(); 
    loadRecentLectures(); 
});

async function loadDashboardSummary() {
    try {
        const response = await fetch(`${API_URL}/analytics/dashboard-summary`);
        if (response.ok) {
            const data = await response.json();
            document.getElementById('totalSubjectsValue').textContent = data.total_subjects;
            document.getElementById('totalNotesValue').textContent = data.total_notes;
            document.getElementById('questionsAskedValue').textContent = data.questions_asked_7d;
            
            // Format study time
            const mins = data.study_time_7d_mins;
            if (mins >= 60) {
                const hrs = Math.floor(mins / 60);
                const rm = mins % 60;
                document.getElementById('studyTimeValue').textContent = `${hrs}h ${rm}m`;
            } else {
                document.getElementById('studyTimeValue').textContent = `${mins}m`;
            }
        }
    } catch (error) {
        console.error('Error loading dashboard summary:', error);
    }
}

async function loadUserInfo() {
    let user = JSON.parse(localStorage.getItem('user') || '{}');
    let name = user.nickname || user.full_name || user.username;

    // If name is missing but we have a token, try to fetch user info
    if (!name) {
        try {
            const response = await fetch('/auth/me');
            if (response.ok) {
                user = await response.json();
                localStorage.setItem('user', JSON.stringify(user));
                name = user.nickname || user.full_name || user.username;
            } else if (response.status === 401) {
                // Token invalid/expired, redirect to login
                window.location.href = '/login';
                return;
            }
        } catch (e) {
            console.error("Failed to fetch user info:", e);
        }
    }

    name = name || 'Student';

    // Use random greeting if available
    if (typeof getRandomGreeting === 'function') {
        const greeting = getRandomGreeting(name);
        const h1 = document.querySelector('h1.welcome-heading');
        if (h1) {
            h1.innerHTML = `<em>${greeting}</em>`;
        }
    } else {
        document.getElementById('userName').textContent = name;
    }
}

async function loadSubjects() {
    try {
        const subjectsRes = await fetch(`${API_URL}/subjects`);

        if (subjectsRes.ok) {
            const subjects = await subjectsRes.json();
            document.getElementById('totalSubjectsValue').textContent = subjects.length;
            window.allSubjects = subjects;
        }
    } catch (error) {
        console.error('Error loading subjects:', error);
    }
}

async function loadRecentLectures() {
    try {
        const response = await fetch(`${API_URL}/lectures`);
        if (response.ok) {
            const lectures = await response.json();
            document.getElementById('totalNotesValue').textContent = lectures.length;

            // Sort by date descending
            lectures.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            displayRecentLectures(lectures.slice(0, 5));
        }
    } catch (error) {
        console.error('Error loading lectures:', error);
    }
}

function displayRecentLectures(lectures) {
    const list = document.getElementById('recentLectures');
    
    if (!lectures || lectures.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <i class="ph ph-files" style="font-size: 48px; margin-bottom: 1rem;"></i>
                <p>No notes yet.</p>
                <a href="/upload" class="btn btn-primary" style="margin-top: 1rem;">Upload First Note</a>
            </div>
        `;
        return;
    }

    list.innerHTML = `<div class='lecture-grid'>` + lectures.map(lecture => {
        const subject = window.allSubjects ? window.allSubjects.find(s => s.id == lecture.subject_id) : null;
        const subjectName = subject ? subject.name : 'Unknown Subject';
        const groupName = subject && subject.groupName ? subject.groupName : null;

        return `
            <div class="lecture-item">
                <div class="lecture-info" onclick="openLecture('${lecture.id}')">
                    <div class="lecture-icon">
                        <i class="ph ${getIconForType(lecture.file_type)}"></i>
                    </div>
                    <div class="lecture-details">
                        <h4>${lecture.title}</h4>
                        <p>
                            ${subjectName} • 
                            ${groupName ? ` ${groupName} • ` : ''}
                            ${new Date(lecture.created_at).toLocaleDateString()}
                        </p>
                    </div>
                </div>
                <div class="lecture-actions">
                    <button onclick="openLecture('${lecture.id}')" class="btn btn-outline btn-small">
                        View
                    </button>
                </div>
            </div>
        `;
    }).join('') + `</div>`;
}

function getIconForType(mimeType) {
    if (!mimeType) return 'ph-file';
    if (mimeType.includes('pdf')) return 'ph-file-pdf';
    if (mimeType.includes('image')) return 'ph-file-image';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'ph-presentation';
    return 'ph-file-text';
}

async function createSubject(event) {
    event.preventDefault();
    try {
        const response = await fetch(`${API_URL}/subjects`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: document.getElementById('subjectName').value,
                description: document.getElementById('subjectDescription').value,
                color: document.getElementById('subjectColor').value
            })
        });

        if (response.ok) {
            closeModal('subjectModal');
            loadSubjects();
        }
    } catch (error) {
        alert('Error creating subject: ' + error.message);
    }
}

function openLecture(id) {
    window.location.href = `/note/${id}`;
}

function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}
