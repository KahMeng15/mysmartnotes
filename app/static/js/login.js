
window.addEventListener('load', async () => {
    try {
        const res = await fetch('/auth/public-settings');
        if (res.ok) {
            const settings = await res.json();
            
            // Update signup link based on signup config
            updateSignupLink(settings.signup_config);
            
            if (settings.unnecessary_logins_enabled) {
                initUnnecessaryLogins();
            }
        }
    } catch (e) { console.error('Error loading public settings', e); }
});

function updateSignupLink(signupConfig) {
    const signupLink = document.getElementById('signupLink');
    if (!signupLink) return;
    
    if (signupConfig === 'invite') {
        signupLink.innerHTML = 'Signup is disabled. Contact the system administrator to create an account and gain access';
        signupLink.style.cursor = 'default';
    } else {
        signupLink.innerHTML = 'Don\'t have an account? <a onclick="switchPanel(\'register\')">Sign up</a>';
    }
}


const UNNECESSARY_SERVICES = [
    { name: 'Microsoft', icon: 'https://cdn-icons-png.flaticon.com/512/732/732221.png' },
    { name: 'GitHub', icon: 'https://cdn.simpleicons.org/github/181717.svg' },
    { name: 'Facebook', icon: 'https://cdn.simpleicons.org/facebook/1877F2.svg' },
    { name: 'Instagram', icon: 'https://cdn.simpleicons.org/instagram/E4405F.svg' },
    { name: 'Twitter', icon: 'https://img.freepik.com/premium-vector/professional-brand-identity-logo-design_659193-41.jpg?semt=ais_hybrid&w=740&q=80' },
    { name: 'TikTok', icon: 'https://cdn.simpleicons.org/tiktok/000000.svg' },
    { name: 'Reddit', icon: 'https://cdn.simpleicons.org/reddit/FF4500.svg' },
    { name: 'Dropbox', icon: 'https://cdn.simpleicons.org/dropbox/0061FF.svg' },
    { name: 'Apple', icon: 'https://cdn.simpleicons.org/apple/000000.svg' },
    { name: 'Spotify', icon: 'https://cdn.simpleicons.org/spotify/1DB954.svg' },
    { name: 'LinkedIn', icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/LinkedIn_icon.svg/3840px-LinkedIn_icon.svg.png' },
    { name: 'Twitch', icon: 'https://cdn.simpleicons.org/twitch/9146FF.svg' },
    { name: 'Adobe', icon: 'https://cdn.simpleicons.org/adobe/FF0000.svg' },
    { name: 'Telegram', icon: 'https://cdn.simpleicons.org/telegram/0088CC.svg' },
    { name: 'Discord', icon: 'https://cdn.simpleicons.org/discord/5865F2.svg' },
    { name: 'WhatsApp', icon: 'https://cdn.simpleicons.org/whatsapp/25D366.svg' },
    { name: 'Shopee', icon: 'https://cdn.simpleicons.org/shopee/EE4D2D.svg' },
    { name: 'Lazada', icon: 'https://toppng.com/uploads/preview/1-11-11739919003ec1pkjyjnn.webp' },
    { name: 'PDF', icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/PDF_file_icon.svg/330px-PDF_file_icon.svg.png' },
    { name: 'Calculator', icon: 'https://cdn-icons-png.flaticon.com/512/75/75775.png' },
    { name: 'Credit Card', icon: 'https://cdn.simpleicons.org/mastercard/EB001B.svg' },
    { name: 'Debit Card', icon: 'https://cdn.simpleicons.org/visa/1A1F71.svg' },
    { name: 'Potato', icon: 'https://cdn-icons-png.flaticon.com/512/1652/1652127.png' },
    { name: 'Nasi Lemak', icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Nasi_Lemak_dengan_Chili_Nasi_Lemak_dan_Sotong_Pedas%2C_di_Penang_Summer_Restaurant.jpg/250px-Nasi_Lemak_dengan_Chili_Nasi_Lemak_dan_Sotong_Pedas%2C_di_Penang_Summer_Restaurant.jpg' },
    { name: 'Job Application', icon: 'https://i.redd.it/n5yycycgpu6f1.jpeg' },
    { name: 'Steam', icon: 'https://cdn.simpleicons.org/steam/000000.svg' },
    { name: 'VSCode', icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Visual_Studio_Code_1.35_icon.svg/3840px-Visual_Studio_Code_1.35_icon.svg.png' },
    { name: 'YouTube', icon: 'https://cdn.simpleicons.org/youtube/FF0000.svg' },
    { name: 'Roblox', icon: 'https://cdn.simpleicons.org/roblox/000000.svg' },
    { name: 'Fingerprint', icon: 'https://cdn-icons-png.flaticon.com/512/2313/2313362.png' },
    { name: 'MyDigitalID', icon: 'https://play-lh.googleusercontent.com/_yuXl7EdqxzBH8_nPGfX6HJD_9HPwG9-CLye1kqUUiS8-KqqrsrVREiv3lT2pNQxag' },
    { name: 'MyJPJ', icon: 'https://play-lh.googleusercontent.com/TTkKgWvAc7URtJY2OCnQ0R7R49sj1NDjlQUF-f3ppVy_5v26hdGRk4Oonbj8x2vjsURAlHtLih7EwfEas35Ssg' },
    { name: 'MySejahtera', icon: 'https://upload.wikimedia.org/wikipedia/en/a/a6/MySejahtera_logo.png' },
    { name: 'CIMB OCTO', icon: 'https://play-lh.googleusercontent.com/0V5acn1KdUAdvWtCmS84lTCu2wCMx4mJP91CyP2va9QW3W-YNwC4eudvtB22UDnQ4N0' },
    { name: 'RHB Online', icon: 'https://play-lh.googleusercontent.com/6QI_2DDtZwqZrDNUQmZZuWf_9tBUnWpmxTwn55056yrNKo4_vPcXWZPES2aYQecfPg' },
    { name: 'TNG eWallet', icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Touch_%27n_Go_eWallet_logo.svg/250px-Touch_%27n_Go_eWallet_logo.svg.png' },
    { name: 'UPMID', icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRDA1r_316VWlW0IsDCkudz47bvVspJaF1ENA&s' }
];

function initUnnecessaryLogins() {
    const grid = document.getElementById('loginAuthGrid');
    const nextBtn = document.getElementById('nextLoginBtn');
    if (!grid || !nextBtn) return;

    // Remove Next button temporarily
    grid.removeChild(nextBtn);
    
    // Add services
    UNNECESSARY_SERVICES.forEach(service => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-google btn-login';
        btn.style.display = 'flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.gap = '8px';
        btn.style.padding = '12px 8px';
        btn.style.minHeight = '44px';
        btn.innerHTML = `
            <img src="${service.icon}" style="width: 20px; height: 20px; flex-shrink: 0;" alt="${service.name} logo" />
            <span style="font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Sign in with ${service.name}</span>
        `;
        btn.style.color = '#333';
        btn.onclick = () => {
            if (service.name === 'Potato') {
                alert('Potato is not a real login method. Please use Nasi Lemak instead.');
                return;
            }
            if (service.name === 'UPMID') {
                window.location.href = 'https://youtu.be/6yfTud-l-JU?si=mAgRf7UlB7ihgSFY';
                return;
            }
            window.location.href = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
        };
        grid.appendChild(btn);
    });
    
    // Add Next button back at the end
    grid.appendChild(nextBtn);
}

function switchPanel(name) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById(name + 'Panel').classList.add('active');
    
    // Manage login auth grid visibility
    const authGrid = document.getElementById('loginAuthGrid');
    if (authGrid) {
        authGrid.style.display = (name === 'login') ? 'grid' : 'none';
    }
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
    document.getElementById('loginAuthGrid').style.display = 'none';
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
    const agree_tos = document.getElementById('regAgreeTos').checked;
    const agree_privacy = document.getElementById('regAgreePrivacy').checked;
    const agree_fair_use = document.getElementById('regAgreeFairUse').checked;
    
    if (!nickname || !email || !password) {
        showMessageBox('registerMsg', 'error', 'All fields are required.');
        return;
    }
    
    if (!agree_tos || !agree_privacy || !agree_fair_use) {
        showMessageBox('registerMsg', 'error', 'You must agree to all policies to register.');
        return;
    }
    
    try {
        const res = await fetch('/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname, email, password, agree_tos, agree_privacy, agree_fair_use })
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
    const agree_tos = document.getElementById('googleAgreeTos').checked;
    const agree_privacy = document.getElementById('googleAgreePrivacy').checked;
    const agree_fair_use = document.getElementById('googleAgreeFairUse').checked;
    
    if (!nickname) {
        showMessageBox('googleRegisterMsg', 'error', 'Please enter a nickname.');
        return;
    }
    
    if (!agree_tos || !agree_privacy || !agree_fair_use) {
        showMessageBox('googleRegisterMsg', 'error', 'You must agree to all policies to register.');
        return;
    }

    try {
        const res = await fetch('/auth/google-complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: window.googleIdToken, nickname, agree_tos, agree_privacy, agree_fair_use })
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
