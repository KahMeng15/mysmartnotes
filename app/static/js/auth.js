/**
 * Global Authentication Handler
 * - Checks for token on page load
 * - Intercepts 401 Unauthorized responses
 * - Redirects to login page (index.html) on auth failure
 */
(function () {
    // 1. Check if token exists on load
    const token = localStorage.getItem('token');

    // List of public pages that don't require authentication
    // Note: index.html is the login page.
    const publicPages = ['index.html', '/', ''];

    const currentPath = window.location.pathname;
    const isPublicPage = publicPages.some(page => currentPath.endsWith(page));

    if (!token && !isPublicPage) {
        // If we are on a protected page and have no token, redirect immediately
        console.warn('No auth token found, redirecting to login...');
        window.location.href = 'index.html';
        return; // Stop execution
    }

    // 2. Intercept fetch requests to handle 401 responses
    const originalFetch = window.fetch;
    window.fetch = async function (url, options = {}) {
        // Add Authorization header if token exists and not already set
        if (token && !options.headers?.Authorization && !options.headers?.['Authorization']) {
            // Note: Some existing calls might set it manually, so we only add if missing OR if we want to enforce it.
            // However, existing code might use different headers or constructs.
            // Given the existing code manually adds 'Authorization': `Bearer ${token}`, 
            // we can either automate it here or just listen for 401s.
            // For now, let's just listen for 401s to avoid breaking custom requests, 
            // as the primary goal is to catch failures.
        }

        try {
            const response = await originalFetch(url, options);

            if (response.status === 401) {
                console.warn('Authentication expired (401), redirecting to login...');
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = 'index.html';
            }

            return response;
        } catch (error) {
            // Network errors or other fetch issues
            throw error;
        }
    };
})();
