/**
 * Global Authentication Handler
 * - Checks for token on page load
 * - Intercepts 401 Unauthorized responses
 * - Redirects to login page (/login) on auth failure
 * - Periodically validates session with /auth/me
 */
(function () {
    // List of public pages that don't require authentication
    const publicPages = ['/login', '/login.html', '/register.html', '/'];
    const currentPath = window.location.pathname;
    const isPublicPage = publicPages.some(page => currentPath === page || currentPath.endsWith(page));

    let token = localStorage.getItem('token');
    
    // 1. Check if token exists on load for protected pages
    if (!token && !isPublicPage) {
        console.warn('No auth token found, redirecting to login...');
        window.location.href = '/login';
        return;
    }

    // 2. Setup periodic session validation with /auth/me
    if (token && !isPublicPage) {
        const validateSession = async () => {
            try {
                const currentToken = localStorage.getItem('token');
                if (!currentToken) {
                    console.warn('Token was cleared, redirecting to login...');
                    window.location.href = '/login';
                    return;
                }

                const response = await fetch('/auth/me', {
                    headers: { 'Authorization': `Bearer ${currentToken}` }
                });
                
                if (response.ok) {
                    const userData = await response.json();
                    localStorage.setItem('user', JSON.stringify(userData));
                    console.debug('✓ Session validated, user data refreshed');
                    
                    // Trigger user display update if function exists
                    if (window.updateDashboardUserName) window.updateDashboardUserName();
                } else if (response.status === 401) {
                    console.warn('Session expired (401), redirecting to login...');
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    window.location.href = '/login';
                }
            } catch (e) {
                console.warn('Session validation error (network issue - ignoring):', e.message);
            }
        };
        
        // Validate immediately on page load
        console.debug('Running initial session validation...');
        validateSession();
        
        // Then validate every 30 seconds
        setInterval(validateSession, 30000);
    }

    // 3. Intercept fetch requests to add auth headers and handle 401
    const originalFetch = window.fetch;

    function getRequestUrl(url) {
        if (typeof url === 'string') {
            return url;
        }

        if (url && typeof url.url === 'string') {
            return url.url;
        }

        return null;
    }

    function isSameOriginRequest(url) {
        const requestUrl = getRequestUrl(url);
        if (!requestUrl) {
            return false;
        }

        // Relative URLs are same-origin by default.
        if (requestUrl.startsWith('/') || (!requestUrl.startsWith('http://') && !requestUrl.startsWith('https://'))) {
            return true;
        }

        try {
            const parsed = new URL(requestUrl, window.location.origin);
            return parsed.origin === window.location.origin;
        } catch {
            // If URL parsing fails, avoid mutating the request.
            return false;
        }
    }

    window.fetch = async function (url, options = {}) {
        const currentToken = localStorage.getItem('token');
        const isSameOrigin = isSameOriginRequest(url);
        
        // Only attach app JWT to our own backend requests.
        if (isSameOrigin && currentToken && !options.headers?.Authorization && !options.headers?.['Authorization']) {
            options.headers = {
                ...options.headers,
                'Authorization': `Bearer ${currentToken}`
            };
        }

        try {
            const response = await originalFetch(url, options);

            // Only handle 401 from our backend, not from external APIs.
            if (response.status === 401 && isSameOrigin) {
                console.error(`❌ 401 Unauthorized on ${url} - clearing session and redirecting to login...`);
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login';
            } else if (response.status === 401) {
                console.warn(`⚠️ 401 from external API (${url}) - ignoring, this may be a Google auth issue`);
            }

            // Handle sliding session: update token if server provided a new one
            const newToken = response.headers.get('X-New-Token');
            if (newToken) {
                console.debug('Updating session token (sliding session)');
                localStorage.setItem('token', newToken);
            }

            return response;
        } catch (error) {
            console.error('❌ Fetch error on', url, ':', error.message);
            throw error;
        }
    };
})();
