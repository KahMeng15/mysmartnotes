/**
 * Global Sidebar Navigation
 * Injects the left sidebar inside an .app-layout flex wrapper.
 * Handles collapse toggle and persists state in localStorage.
 */

// Global function to sync user display
window.syncUserDisplay = async function() {
    try {
        // Fetch latest user data from /auth/me
        const response = await fetch('/auth/me');
        
        if (response.ok) {
            const userData = await response.json();
            localStorage.setItem('user', JSON.stringify(userData));
            // Update dashboard heading with new user data
            updateDashboardUserName();
        } else if (response.status === 401) {
            // Session is invalid, redirect to login
            localStorage.removeItem('user');
            localStorage.removeItem('token');
            window.location.href = '/login';
        }
    } catch (e) {
        console.warn('Error syncing user data:', e);
    }
};

window.updateDashboardUserName = function() {
    const userStr = localStorage.getItem('user');
    if (!userStr) return;
    try {
        const user = JSON.parse(userStr);
        const name = user.nickname || user.full_name || user.username || 'Student';
        const dashboardUserEl = document.getElementById('userName');
        if (dashboardUserEl) {
            dashboardUserEl.textContent = name;
        }
    } catch (e) {
        console.error('Error updating dashboard user name', e);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Sync user data from backend on page load
    window.syncUserDisplay();
    injectSidebar();
});

function injectSidebar() {
    const isNotePage = document.body.classList.contains('note-page');
    const collapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    
    const userStr = localStorage.getItem('user');
    let isAdmin = false;
    if (userStr) {
        try { isAdmin = JSON.parse(userStr).is_admin; } catch(e) {}
    }
    
    const adminItem = isAdmin ? `<li><a href="/admin" class="sidebar-nav-link" data-page="admin"><i class="ph ph-shield-star"></i><span>Admin</span></a></li>` : '';

    // Check Pomodoro state immediately for sync injection
    const pomoSaved = localStorage.getItem('pomodoroState');
    let pomoDisplay = 'none';
    let pomoTime = '00:00';
    let pomoMode = 'STUDY';
    let pomoIcon = 'ph ph-play';
    
    if (pomoSaved) {
        const state = JSON.parse(pomoSaved);
        const mins = Math.floor(Math.abs(state.timeLeft) / 60);
        const secs = Math.abs(state.timeLeft) % 60;
        pomoTime = `${mins}:${secs.toString().padStart(2, '0')}`;
        pomoMode = (state.timerMode || 'study').replace('_', ' ').toUpperCase();
        pomoIcon = state.isRunning ? 'ph ph-pause' : 'ph ph-play';
        
        const isActive = state.isRunning || state.timeLeft < (state.timerMode === 'pomodoro' ? 25*60 : 5*60);
        if (isActive) pomoDisplay = 'block';
    }

    const sidebarHtml = `
    <!-- Mobile Header -->
    <header class="mobile-header">
        <a href="/dashboard" class="mobile-brand">mysmartnotes</a>
        <button class="mobile-menu-toggle" onclick="toggleMobileMenu()">
            <i class="ph ph-list"></i>
        </button>
    </header>

    <aside class="app-sidebar" id="appSidebar">
        <div class="sidebar-mobile-header">
             <a href="/dashboard" class="mobile-brand">mysmartnotes</a>
             <button class="mobile-menu-close" onclick="toggleMobileMenu()">
                <i class="ph ph-x"></i>
            </button>
        </div>

        <a href="/dashboard" class="sidebar-brand">my<br>smart<br>notes</a>

        <ul class="sidebar-nav-list" id="sidebarNav">
            <li><a href="/dashboard" class="sidebar-nav-link" data-page="dashboard"><i class="ph ph-house-line"></i><span>Home</span></a></li>
            <li><a href="/mynotes" class="sidebar-nav-link" data-page="mynotes"><i class="ph ph-notebook"></i><span>Notes</span></a></li>
            <li><a href="/chat" class="sidebar-nav-link" data-page="chat"><i class="ph ph-chat-circle-dots"></i><span>Chat</span></a></li>
            <li><a href="/quiz" class="sidebar-nav-link" data-page="quiz"><i class="ph ph-exam"></i><span>Quiz</span></a></li>

            <li><a href="/pomodoro" class="sidebar-nav-link" data-page="pomodoro" id="pomodoroNavLink"><i class="ph ph-clock"></i><span>Pomodoro</span></a></li>
            <li><a href="/upload" class="sidebar-nav-link" data-page="upload"><i class="ph ph-upload-simple"></i><span>Upload</span></a></li>
            <li><a href="/exporttemplates" class="sidebar-nav-link" data-page="exporttemplates"><i class="ph ph-palette"></i><span>Templates</span></a></li>
            <li class="sidebar-divider"></li>
            ${adminItem}
            <li><a href="/settings" class="sidebar-nav-link" data-page="settings"><i class="ph ph-gear"></i><span>Settings</span></a></li>
            <li><a href="#" class="sidebar-nav-link disabled" title="Coming soon"><i class="ph ph-clock-user"></i><span>Recent</span></a></li>
        </ul>

        <button class="sidebar-toggle" onclick="toggleSidebar()" title="Collapse sidebar" id="sidebarToggleBtn">
            <i class="ph ph-caret-left" id="sidebarToggleIcon"></i>
        </button>

        <!-- Pomodoro Mini Widget -->
        <div id="sidebarPomodoroWidget" class="sidebar-pomo-widget" style="display:${pomoDisplay};">
            <div class="pomo-widget-content">
                <div class="pomo-widget-info">
                    <span id="pomoWidgetTime">${pomoTime}</span>
                    <small id="pomoWidgetMode">${pomoMode}</small>
                </div>
                <div class="pomo-widget-actions">
                    <button id="pomoWidgetToggle" title="Play/Pause"><i class="${pomoIcon}"></i></button>
                    <button id="pomoWidgetStop" title="Stop"><i class="ph ph-stop"></i></button>
                </div>
            </div>
        </div>

        <div class="sidebar-user" onclick="logout()" title="Logout">
            <div class="sidebar-avatar" id="sidebarAvatarInitial">?</div>
            <span class="sidebar-user-name" id="sidebarUserName">...</span>
        </div>
    </aside>

    <!-- Mobile Bottom Nav -->
    <nav class="mobile-bottom-nav">
        <a href="/dashboard" class="mobile-nav-item" data-page="dashboard">
            <i class="ph ph-house-line"></i>
            <span>Home</span>
        </a>
        <a href="/mynotes" class="mobile-nav-item" data-page="mynotes">
            <i class="ph ph-notebook"></i>
            <span>Notes</span>
        </a>
        <a href="/chat" class="mobile-nav-item" data-page="chat">
            <i class="ph ph-chat-circle-dots"></i>
            <span>Chat</span>
        </a>
        <a href="/quiz" class="mobile-nav-item" data-page="quiz">
            <i class="ph ph-exam"></i>
            <span>Quiz</span>
        </a>
        <a href="javascript:void(0)" class="mobile-nav-item" onclick="toggleMobileMenu()">
            <i class="ph ph-dots-three-circle"></i>
            <span>More</span>
        </a>
    </nav>
    <div class="mobile-overlay" id="mobileOverlay" onclick="toggleMobileMenu()"></div>
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
    updateSidebarWidget();
}

window.toggleMobileMenu = function() {
    const sidebar = document.getElementById('appSidebar');
    const overlay = document.getElementById('mobileOverlay');
    if (sidebar) sidebar.classList.toggle('mobile-active');
    if (overlay) overlay.classList.toggle('active');
    document.body.classList.toggle('menu-open');
};

function setActiveLink() {
    const currentPath = window.location.pathname;
    const pathParts = currentPath.split('/');
    const pageName = pathParts.pop() || 'dashboard';

    document.querySelectorAll('.sidebar-nav-link[data-page], .mobile-nav-item[data-page]').forEach(link => {
        const linkPage = link.dataset.page;
        if (linkPage === pageName || (linkPage === 'chat' && currentPath.startsWith('/chat'))) {
            link.classList.add('active');
        }
    });

    // note.html — highlight Notes
    if (pageName === '' || currentPath.includes('/note/')) {
        const notesLinks = document.querySelectorAll('[data-page="mynotes"]');
        notesLinks.forEach(link => link.classList.add('active'));
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

window.confirmLogout = async function () {
    try {
        await fetch('/auth/logout', { method: 'POST' });
    } catch (e) {
        console.warn('Logout request failed, continuing local cleanup:', e);
    }

    localStorage.removeItem('user');
    localStorage.removeItem('token');
    window.location.href = '/login';
};

window.cancelLogout = function () {
    const logoutModal = document.getElementById('logoutConfirmModal');
    if (logoutModal) {
        logoutModal.classList.remove('active');
    }
};

// Pomodoro Sidebar Sync & Persistence
const navSyncChannel = new BroadcastChannel('pomodoro_sync');
let sidePomoInterval = null;

function updateSidebarWidget() {
    const saved = localStorage.getItem('pomodoroState');
    if (!saved) return;
    
    const state = JSON.parse(saved);
    const widget = document.getElementById('sidebarPomodoroWidget');
    if (!widget) return;

    // Show widget if a session is active or paused mid-way
    const isActive = state.isRunning || state.timeLeft < (state.timerMode === 'pomodoro' ? 25*60 : 5*60);
    widget.style.display = isActive ? 'block' : 'none';

    if (!isActive) {
        clearInterval(sidePomoInterval);
        return;
    }

    const timeEl = document.getElementById('pomoWidgetTime');
    const modeEl = document.getElementById('pomoWidgetMode');
    const toggleBtn = document.getElementById('pomoWidgetToggle');

    const mins = Math.floor(Math.abs(state.timeLeft) / 60);
    const secs = Math.abs(state.timeLeft) % 60;
    const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
    
    if (timeEl) timeEl.textContent = timeStr;
    if (modeEl) modeEl.textContent = (state.timerMode || 'study').replace('_', ' ').toUpperCase();
    if (toggleBtn) toggleBtn.innerHTML = state.isRunning ? '<i class="ph ph-pause"></i>' : '<i class="ph ph-play"></i>';

    // If running and no interval, start a local one to keep sidebar ticking
    if (state.isRunning && !sidePomoInterval) {
        sidePomoInterval = setInterval(() => {
            const currentState = JSON.parse(localStorage.getItem('pomodoroState'));
            if (currentState && currentState.isRunning) {
                currentState.timeLeft--;
                if (currentState.timeLeft <= 0) {
                    currentState.isRunning = false;
                    clearInterval(sidePomoInterval);
                    sidePomoInterval = null;
                }
                localStorage.setItem('pomodoroState', JSON.stringify(currentState));
                updateSidebarWidget();
            } else {
                clearInterval(sidePomoInterval);
                sidePomoInterval = null;
            }
        }, 1000);
    }
}

navSyncChannel.onmessage = (event) => {
    if (event.data.type === 'TICK') {
        updateSidebarWidget();
    }
};

// Handle widget clicks
document.addEventListener('click', (e) => {
    if (e.target.closest('#pomoWidgetToggle')) {
        const state = JSON.parse(localStorage.getItem('pomodoroState') || '{}');
        const newRunning = !state.isRunning;
        state.isRunning = newRunning;
        localStorage.setItem('pomodoroState', JSON.stringify(state));
        navSyncChannel.postMessage({ type: 'COMMAND', action: 'TOGGLE' });
        updateSidebarWidget();
    }
    if (e.target.closest('#pomoWidgetStop')) {
        localStorage.removeItem('pomodoroState');
        navSyncChannel.postMessage({ type: 'COMMAND', action: 'STOP' });
        document.getElementById('sidebarPomodoroWidget').style.display = 'none';
        clearInterval(sidePomoInterval);
        sidePomoInterval = null;
    }
});
