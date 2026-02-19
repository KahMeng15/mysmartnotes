/**
 * Global Navigation Bar
 * - Injects the navbar into the page
 * - Highlights active link
 * - Handles logout (replacing local implementations)
 */

document.addEventListener('DOMContentLoaded', () => {
    injectNavbar();
});

function injectNavbar() {
    // Standard Navbar HTML
    const navbarHtml = `
    <nav class="navbar">
        <div class="container">
            <div class="d-flex justify-content-between align-items-center">
                <a href="dashboard.html" class="navbar-brand"><i class="ph ph-books"></i> MySmartNotes</a>
                <ul class="navbar-nav">
                    <li><a href="dashboard.html" class="nav-link">Dashboard</a></li>
                    <li><a href="mynotes.html" class="nav-link">My Notes</a></li>
                    <li><a href="chat.html" class="nav-link">Chat</a></li>
                    <li><a href="upload.html" class="nav-link">Upload</a></li>
                </ul>
                <div style="display: flex; align-items: center; gap: var(--spacing-lg);">
                    <a href="settings.html" class="nav-link"><i class="ph ph-gear"></i> Settings</a>
                    <span id="navUserDisplay" style="font-size: var(--font-size-sm); font-weight: 500; color: var(--color-text);"></span>
                    <div class="avatar" onclick="logout()" style="cursor: pointer;" title="Logout"><i class="ph ph-user"></i></div>
                </div>
            </div>
        </div>
    </nav>
    `;

    // 1. Try to find a placeholder (if we decide to use one)
    // 2. Or insert at the top of the body (standard approach)
    // 3. Or replace existing <nav> if it exists (for smoother transition if scripts load late?)
    //    Actually, we are replacing the hardcoded nav in HTML with just the script, so prepending to body is safest.

    // However, some existing pages have <nav> which we will delete in HTML.
    // So we just prepend to body.
    document.body.insertAdjacentHTML('afterbegin', navbarHtml);

    // Set active link based on current URL
    setActiveLink();

    // Display user name
    displayUser();
}

function setActiveLink() {
    const currentPath = window.location.pathname;
    const pageName = currentPath.split('/').pop() || 'index.html';

    const links = document.querySelectorAll('.navbar-nav .nav-link');
    links.forEach(link => {
        const href = link.getAttribute('href');
        if (href === pageName) {
            link.classList.add('active');
        }
    });

    // Handle Settings separately as it is outside the main list
    if (pageName === 'settings.html') {
        const settingsLink = document.querySelector('a[href="settings.html"]');
        if (settingsLink) settingsLink.classList.add('active');
    }
}

function displayUser() {
    const userStr = localStorage.getItem('user');
    if (userStr) {
        try {
            const user = JSON.parse(userStr);
            const display = document.getElementById('navUserDisplay');
            if (display) {
                display.textContent = user.nickname || user.full_name || user.username || 'Student';
            }
        } catch (e) {
            console.error('Error parsing user data', e);
        }
    }
}

// Global Logout Function
// (Attached to window so it can be called from onclick="logout()")
window.logout = function () {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'index.html';
    }
};
