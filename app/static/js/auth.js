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

    let isRefreshing = false;
    let refreshSubscribers = [];

    function subscribeTokenRefresh(cb) {
        refreshSubscribers.push(cb);
    }

    function onRerfreshed(token) {
        refreshSubscribers.map(cb => cb(token));
        refreshSubscribers = [];
    }

    window.fetch = async function (url, options = {}) {
        const isSameOrigin = isSameOriginRequest(url);
        const method = (options.method || 'GET').toUpperCase();
        
        // CSRF handling
        const csrfToken = getCookie('csrf_token');
        if (isSameOrigin && !['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method) && csrfToken) {
            options.headers = {
                ...options.headers,
                'X-CSRF-Token': csrfToken
            };
        }

        try {
            let response = await originalFetch(url, options);

            // Handle 401 Unauthorized by attempting to refresh token
            if (response.status === 401 && isSameOrigin && !url.includes('/auth/refresh') && !url.includes('/auth/login')) {
                if (!isRefreshing) {
                    isRefreshing = true;
                    console.debug('🔄 401 detected, attempting to refresh token...');
                    
                    try {
                        const refreshResponse = await originalFetch('/auth/refresh', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-CSRF-Token': csrfToken
                            }
                        });

                        if (refreshResponse.ok) {
                            const data = await refreshResponse.json();
                            const newToken = data.access_token;
                            console.debug('✅ Token refreshed successfully');
                            
                            localStorage.setItem('token', newToken);
                            isRefreshing = false;
                            onRerfreshed(newToken);
                        } else {
                            throw new Error('Refresh failed');
                        }
                    } catch (err) {
                        console.error('❌ Session expired and refresh failed. Redirecting to login.');
                        isRefreshing = false;
                        localStorage.removeItem('user');
                        localStorage.removeItem('token');
                        window.location.href = '/login';
                        return response;
                    }
                }

                // Wait for the token to be refreshed
                const retryOriginalRequest = new Promise((resolve) => {
                    subscribeTokenRefresh((newToken) => {
                        // Update the Authorization header with the new token
                        if (options.headers) {
                            if (options.headers['Authorization']) {
                                options.headers['Authorization'] = `Bearer ${newToken}`;
                            } else if (options.headers.get && typeof options.headers.get === 'function' && options.headers.get('Authorization')) {
                                options.headers.set('Authorization', `Bearer ${newToken}`);
                            } else if (Array.isArray(options.headers)) {
                                // For array-like headers, though less common in this app's fetch calls
                                const authIndex = options.headers.findIndex(h => h[0] === 'Authorization');
                                if (authIndex >= 0) options.headers[authIndex][1] = `Bearer ${newToken}`;
                            }
                        }
                        
                        // Re-fetch with updated options
                        resolve(originalFetch(url, options));
                    });
                });
                
                return await retryOriginalRequest;
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

