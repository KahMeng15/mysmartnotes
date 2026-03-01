/**
 * Global Authentication Handler
 * - Checks for token on page load
 * - Intercepts 401 Unauthorized responses
 * - Redirects to login page (login.html) on auth failure
 */
(function () {
    // 1. Check if token exists on load
    const token = localStorage.getItem('token');

    // List of public pages that don't require authentication
    // Note: login.html is the login page.
    const publicPages = ['login.html', '/', ''];

    const currentPath = window.location.pathname;
    const isPublicPage = publicPages.some(page => currentPath.endsWith(page));

    if (!token && !isPublicPage) {
        // If we are on a protected page and have no token, redirect immediately
        console.warn('No auth token found, redirecting to login...');
        window.location.href = 'login.html';
        return; // Stop execution
    }

    // 2. Intercept fetch requests to handle 401 responses
    const originalFetch = window.fetch;
    window.fetch = async function (url, options = {}) {
        // Add Authorization header if token exists and not already set
        if (token && !options.headers?.Authorization && !options.headers?.['Authorization']) {
            options.headers = {
                ...options.headers,
                'Authorization': `Bearer ${token}`
            };
        }

        try {
            const response = await originalFetch(url, options);

            if (response.status === 401) {
                console.warn('Authentication expired (401), redirecting to login...');
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = 'login.html';
            }

            return response;
        } catch (error) {
            // Network errors or other fetch issues
            throw error;
        }
    };
})();
