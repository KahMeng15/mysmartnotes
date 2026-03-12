
function switchPanel(name) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById(name + 'Panel').classList.add('active');
}

function showMessageBox(id, type, text) {
    const el = document.getElementById(id);
    el.className = 'message-box ' + type;
    el.textContent = text;
}

function showPasswordField() {
    const email = document.getElementById('loginEmail').value.trim();
    if (!email) {
        showMessageBox('loginMsg', 'error', 'Please enter your email first.');
        return;
    }
    document.getElementById('loginPasswordGroup').style.display = 'block';
    document.getElementById('loginStep1Btns').style.display = 'none';
    document.getElementById('loginStep2Btns').style.display = 'block';
    document.getElementById('loginPassword').focus();
}

async function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) {
        showMessageBox('loginMsg', 'error', 'Please enter your email and password.');
        return;
    }
    try {
        const res = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        if (res.ok) {
            const data = await res.json();
            localStorage.setItem('token', data.access_token);
            if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
            showMessageBox('loginMsg', 'success', 'Welcome back! Redirecting…');
            setTimeout(() => { window.location.href = '/dashboard.html'; }, 800);
        } else {
            const err = await res.json();
            if (res.status === 503) {
                showMessageBox('loginMsg', 'error', err.detail || 'Under maintenance.');
                setTimeout(() => { window.location.href = '/maintenance'; }, 2000);
            } else {
                showMessageBox('loginMsg', 'error', err.detail || 'Login failed. Please check your credentials.');
            }
        }
    } catch (e) {
        showMessageBox('loginMsg', 'error', 'Connection error. Please try again.');
    }
}

async function handleRegister() {
    const nickname = document.getElementById('regNickname').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    if (!nickname || !email || !password) {
        showMessageBox('registerMsg', 'error', 'All fields are required.');
        return;
    }
    try {
        const res = await fetch('/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname, email, password })
        });
        if (res.ok) {
            showMessageBox('registerMsg', 'success', 'Account created! Please sign in.');
            setTimeout(() => switchPanel('login'), 1500);
        } else {
            const err = await res.json();
            showMessageBox('registerMsg', 'error', err.detail || 'Registration failed.');
        }
    } catch (e) {
        showMessageBox('registerMsg', 'error', 'Connection error. Please try again.');
    }
}

async function handleGoogleSignIn() {
    try {
        // Wait a moment for Firebase to initialize
        if (!window.firebaseAuth || !window.googleProvider) {
            setTimeout(handleGoogleSignIn, 500);
            return;
        }

        const result = await window.signInWithPopup(window.firebaseAuth, window.googleProvider);
        const user = result.user;
        const idToken = await user.getIdToken();

        // Send token to backend to verify
        const res = await fetch('/auth/google-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken })
        });

        if (res.ok) {
            const data = await res.json();

            if (data.is_new_user) {
                // New user - show registration modal
                window.googleIdToken = idToken; // Store for later
                showGoogleRegisterModal(data);
            } else {
                // Existing user - log them in
                localStorage.setItem('token', data.access_token);
                if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
                showMessageBox('loginMsg', 'success', 'Welcome back! Redirecting…');
                setTimeout(() => { window.location.href = '/dashboard.html'; }, 800);
            }
        } else {
            const err = await res.json();
            if (res.status === 503) {
                showMessageBox('loginMsg', 'error', err.detail || 'Under maintenance.');
                setTimeout(() => { window.location.href = '/maintenance'; }, 2000);
            } else {
                showMessageBox('loginMsg', 'error', err.detail || 'Google sign-in failed.');
            }
            // Sign out from Firebase if backend failed
            window.firebaseAuth.signOut();
        }
    } catch (e) {
        if (e.code === 'auth/popup-closed-by-user') {
            // User closed the popup, no error message needed
        } else if (e.code === 'auth/popup-blocked') {
            showMessageBox('loginMsg', 'error', 'Pop-up blocked. Please allow pop-ups for this site.');
        } else {
            console.error('Google Sign-In error:', e);
            showMessageBox('loginMsg', 'error', 'Google sign-in failed. Please try again.');
        }
    }
}

function showGoogleRegisterModal(data) {
    document.getElementById('googleEmail').value = data.email;
    document.getElementById('googleFullName').value = data.full_name || '(not provided)';
    document.getElementById('googleNickname').value = data.suggested_nickname || '';
    switchPanel('googleRegister');
    document.getElementById('googleNickname').focus();
}

function closeGoogleRegisterModal() {
    switchPanel('login');
    window.googleIdToken = null;
    // Sign out from Firebase when closing panel
    if (window.firebaseAuth) {
        window.firebaseAuth.signOut();
    }
}

async function handleGoogleComplete(event) {
    event.preventDefault();

    if (!window.googleIdToken) {
        showMessageBox('loginMsg', 'error', 'Session expired. Please try again.');
        closeGoogleRegisterModal();
        return;
    }

    const nickname = document.getElementById('googleNickname').value.trim();
    if (!nickname) {
        showMessageBox('googleRegisterMsg', 'error', 'Please enter a nickname.');
        return;
    }

    try {
        const res = await fetch('/auth/google-complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: window.googleIdToken, nickname })
        });

        if (res.ok) {
            const data = await res.json();
            localStorage.setItem('token', data.access_token);
            if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
            showMessageBox('googleRegisterMsg', 'success', 'Welcome! Redirecting…');
            setTimeout(() => { window.location.href = '/dashboard.html'; }, 800);
        } else {
            const err = await res.json();
            if (res.status === 503) {
                showMessageBox('googleRegisterMsg', 'error', err.detail || 'Under maintenance.');
                setTimeout(() => { window.location.href = '/maintenance'; }, 2000);
            } else {
                showMessageBox('googleRegisterMsg', 'error', err.detail || 'Registration failed.');
            }
        }
    } catch (e) {
        console.error('Google registration error:', e);
        showMessageBox('googleRegisterMsg', 'error', 'An error occurred. Please try again.');
    }
}

// Allow Enter key to advance form
document.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        if (document.getElementById('loginPanel').classList.contains('active')) {
            if (document.getElementById('loginStep2Btns').style.display === 'block') {
                handleLogin();
            } else {
                showPasswordField();
            }
        } else {
            handleRegister();
        }
    }
});
