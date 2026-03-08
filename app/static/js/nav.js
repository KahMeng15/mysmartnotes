/**
 * Global Sidebar Navigation
 * Injects the left sidebar inside an .app-layout flex wrapper.
 * Handles collapse toggle and persists state in localStorage.
 */

document.addEventListener('DOMContentLoaded', () => {
    injectSidebar();
});

function injectSidebar() {
    const isNotePage = document.body.classList.contains('note-page');
    const collapsed = localStorage.getItem('sidebarCollapsed') === 'true';

    const sidebarHtml = `
    <aside class="app-sidebar" id="appSidebar">
        <a href="/dashboard.html" class="sidebar-brand">my<br>smart<br>notes</a>

        <ul class="sidebar-nav-list" id="sidebarNav">
            <li><a href="/dashboard.html" class="sidebar-nav-link" data-page="dashboard.html"><i class="ph ph-house-line"></i><span>Home</span></a></li>
            <li><a href="/mynotes.html" class="sidebar-nav-link" data-page="mynotes.html"><i class="ph ph-notebook"></i><span>Notes</span></a></li>
            <li><a href="/chat.html" class="sidebar-nav-link" data-page="chat.html"><i class="ph ph-chat-circle-dots"></i><span>Chat</span></a></li>
            <li><a href="#" class="sidebar-nav-link disabled" title="Coming soon"><i class="ph ph-exam"></i><span>Quiz</span></a></li>
            <li><a href="/flashcards.html" class="sidebar-nav-link" data-page="flashcards.html"><i class="ph ph-cards"></i><span>Flashcards</span></a></li>
            <li><a href="#" class="sidebar-nav-link disabled" title="Coming soon"><i class="ph ph-clock"></i><span>Pomodoro</span></a></li>
            <li><a href="/upload.html" class="sidebar-nav-link" data-page="upload.html"><i class="ph ph-upload-simple"></i><span>Upload</span></a></li>
            <li><a href="/templates.html" class="sidebar-nav-link" data-page="templates.html"><i class="ph ph-palette"></i><span>Templates</span></a></li>
            <li class="sidebar-divider"></li>
            <li><a href="/settings.html" class="sidebar-nav-link" data-page="settings.html"><i class="ph ph-gear"></i><span>Settings</span></a></li>
            <li><a href="#" class="sidebar-nav-link disabled" title="Coming soon"><i class="ph ph-clock-user"></i><span>Recent</span></a></li>
        </ul>

        <button class="sidebar-toggle" onclick="toggleSidebar()" title="Collapse sidebar" id="sidebarToggleBtn">
            <i class="ph ph-caret-left" id="sidebarToggleIcon"></i>
        </button>

        <div class="sidebar-user" onclick="logout()" title="Logout">
            <div class="sidebar-avatar" id="sidebarAvatarInitial">?</div>
            <span class="sidebar-user-name" id="sidebarUserName">...</span>
        </div>
    </aside>
    `;

    if (isNotePage) {
        // Note page: sidebar is a sibling of content/chat/action inside .app-layout
        // .app-layout already exists in note.html — just prepend sidebar into it
        const appLayout = document.querySelector('.app-layout');
        if (appLayout) {
            appLayout.insertAdjacentHTML('afterbegin', sidebarHtml);
            if (collapsed) appLayout.classList.add('sidebar-collapsed');
        }
    } else {
        // All other pages: wrap body children in .app-layout > sidebar + .app-main
        const children = Array.from(document.body.children);
        const wrapper = document.createElement('div');
        wrapper.className = 'app-layout' + (collapsed ? ' sidebar-collapsed' : '');

        const main = document.createElement('main');
        main.className = 'app-main';

        // Move all existing body children into main
        children.forEach(child => main.appendChild(child));

        wrapper.innerHTML = sidebarHtml;
        wrapper.appendChild(main);
        document.body.appendChild(wrapper);
    }

    setActiveLink();
    displayUser();
    updateToggleIcon();
}

function setActiveLink() {
    const currentPath = window.location.pathname;
    const pageName = currentPath.split('/').pop() || 'dashboard.html';

    document.querySelectorAll('.sidebar-nav-link[data-page]').forEach(link => {
        if (link.dataset.page === pageName) {
            link.classList.add('active');
        }
    });

    // note.html — highlight Notes
    if (pageName === '' || currentPath.includes('/note/')) {
        const notesLink = document.querySelector('.sidebar-nav-link[data-page="mynotes.html"]');
        if (notesLink) notesLink.classList.add('active');
    }
}

function displayUser() {
    const userStr = localStorage.getItem('user');
    if (!userStr) return;
    try {
        const user = JSON.parse(userStr);
        const name = user.nickname || user.full_name || user.username || 'Student';
        const nameEl = document.getElementById('sidebarUserName');
        const avatarEl = document.getElementById('sidebarAvatarInitial');
        if (nameEl) nameEl.textContent = name;
        if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();
    } catch (e) {
        console.error('Error parsing user data', e);
    }
}

window.toggleSidebar = function () {
    const layout = document.querySelector('.app-layout');
    if (!layout) return;
    layout.classList.toggle('sidebar-collapsed');
    const isCollapsed = layout.classList.contains('sidebar-collapsed');
    localStorage.setItem('sidebarCollapsed', isCollapsed);
    updateToggleIcon();
};

function updateToggleIcon() {
    const icon = document.getElementById('sidebarToggleIcon');
    const layout = document.querySelector('.app-layout');
    if (!icon || !layout) return;
    const isCollapsed = layout.classList.contains('sidebar-collapsed');
    icon.className = isCollapsed ? 'ph ph-caret-right' : 'ph ph-caret-left';
}

window.logout = function () {
    // Create logout modal if it doesn't exist
    let logoutModal = document.getElementById('logoutConfirmModal');
    if (!logoutModal) {
        logoutModal = document.createElement('div');
        logoutModal.id = 'logoutConfirmModal';
        logoutModal.className = 'modal';
        logoutModal.innerHTML = `
            <div class="modal-content" style="min-height: auto;">
                <h3>Logout?</h3>
                <p style="margin-bottom: var(--spacing-lg); color: var(--color-gray);">Are you sure you want to logout? You will need to log in again to access your account.</p>
                <div class="modal-buttons">
                    <button type="button" class="btn-save" style="background: var(--color-error);" onmouseover="this.style.background='#c0392b'" onmouseout="this.style.background='var(--color-error)'" onclick="confirmLogout()">Logout</button>
                    <button type="button" class="btn-cancel" onclick="cancelLogout()">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(logoutModal);
    }

    // Show the modal
    logoutModal.classList.add('active');
};

window.confirmLogout = function () {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
};

window.cancelLogout = function () {
    const logoutModal = document.getElementById('logoutConfirmModal');
    if (logoutModal) {
        logoutModal.classList.remove('active');
    }
};
