/**
 * Global Authentication Handler
 * - Checks for token on page load
 * - Intercepts 401 Unauthorized responses
 * - Redirects to login page (/login) on auth failure
 * - Periodically validates session with /auth/me
 */
(async function () {
    // List of public pages that don't require authentication
    const publicPages = ['/login', '/login.html', '/register.html', '/'];
    const currentPath = window.location.pathname;
    const isPublicPage = publicPages.some(page => currentPath === page || currentPath.endsWith(page));

    // --- 0. Intercept fetch requests IMMEDIATELY to avoid race conditions ---
    const originalFetch = window.fetch;

    function getRequestUrl(url) {
        if (typeof url === 'string') return url;
        if (url && typeof url.url === 'string') return url.url;
        return null;
    }

    function isSameOriginRequest(url) {
        const requestUrl = getRequestUrl(url);
        if (!requestUrl) return false;
        if (requestUrl.startsWith('/') || (!requestUrl.startsWith('http://') && !requestUrl.startsWith('https://'))) return true;
        try {
            const parsed = new URL(requestUrl, window.location.origin);
            return parsed.origin === window.location.origin;
        } catch { return false; }
    }

    function getCookie(name) {
        const cookie = document.cookie
            .split(';')
            .map(part => part.trim())
            .find(part => part.startsWith(`${name}=`));
        if (!cookie) return null;
        return decodeURIComponent(cookie.substring(name.length + 1));
    }

    window.fetch = async function (url, options = {}) {
        const isSameOrigin = isSameOriginRequest(url);
        const method = (options.method || 'GET').toUpperCase();
        const csrfToken = getCookie('csrf_token');
        
        // Extract Authorization header
        let authHeaderValue = null;
        if (options.headers instanceof Headers) {
            authHeaderValue = options.headers.get('Authorization');
        } else if (options.headers) {
            authHeaderValue = options.headers.Authorization || options.headers['Authorization'];
        }

        const hasInvalidBearer = typeof authHeaderValue === 'string' && /^Bearer\s+(null|undefined)$/i.test(authHeaderValue.trim());

        // Strip ONLY invalid explicit bearer headers (Bearer null/undefined)
        if (isSameOrigin && hasInvalidBearer) {
            if (options.headers instanceof Headers) {
                options.headers.delete('Authorization');
            } else if (options.headers) {
                options.headers = { ...options.headers };
                delete options.headers.Authorization;
                delete options.headers['Authorization'];
            }
        }

        if (isSameOrigin && !['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method) && csrfToken) {
            options.headers = {
                ...options.headers,
                'X-CSRF-Token': csrfToken
            };
        }

        try {
            const response = await originalFetch(url, options);

            // Only handle 401 from our backend
            if (response.status === 401 && isSameOrigin) {
                console.error(`❌ 401 Unauthorized on ${url} - clearing session and redirecting to login...`);
                localStorage.removeItem('user');
                localStorage.removeItem('token');
                window.location.href = '/login';
            }

            return response;
        } catch (error) {
            console.error('❌ Fetch error on', url, ':', error.message);
            throw error;
        }
    };

    // --- 1. Check if cookie session exists on load for protected pages ---
    async function hasCookieSession() {
        try {
            const response = await fetch('/auth/me');
            return response.ok;
        } catch {
            return false;
        }
    }
    
    if (!isPublicPage) {
        const cookieSessionValid = await hasCookieSession();
        if (!cookieSessionValid) {
            console.warn('No auth session found, redirecting to login...');
            window.location.href = '/login';
            return;
        }
    }

    // --- 2. Setup periodic session validation with /auth/me ---
    if (!isPublicPage) {
        const validateSession = async () => {
            try {
                const response = await fetch('/auth/me');
                
                if (response.ok) {
                    const userData = await response.json();
                    localStorage.setItem('user', JSON.stringify(userData));
                    console.debug('✓ Session validated, user data refreshed');
                    
                    // Trigger user display update if function exists
                    if (window.updateDashboardUserName) window.updateDashboardUserName();
                } else if (response.status === 401) {
                    console.warn('Session expired (401), redirecting to login...');
                    localStorage.removeItem('user');
                    localStorage.removeItem('token');
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
})();

