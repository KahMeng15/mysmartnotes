const API_URL = '';

const tierGradients = {
    unlimited: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    free: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    pro: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    early_tester: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)'
};
const defaultTierGradient = tierGradients.unlimited;
let pendingUnlinkAfterPasswordSetup = false;
window.hasStoredAiApiKey = false;

// Wait for Firebase to be initialized
async function waitForFirebase(timeout = 5000) {
    const startTime = Date.now();
    while (!window.firebaseAuth || !window.googleProvider) {
        if (Date.now() - startTime > timeout) {
            throw new Error('Firebase initialization timeout');
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

window.addEventListener('load', async () => {
    try {
        console.log('=== SETTINGS PAGE LOAD START ===');
        console.log('URL:', window.location.href);
        
        // Get fresh token on page load (let auth.js handle session validation)
        const token = localStorage.getItem('token');
        console.log('Token exists?', !!token);
        
        if (!token) {
            console.warn('No token found in localStorage, redirecting to login');
            window.location.href = '/login';
            return;
        }
        
        console.log('Token found, calling load functions...');
        
        try {
            loadSettings();
            console.log('✓ loadSettings completed');
        } catch(e) {
            console.error('❌ loadSettings failed:', e);
        }
        
        try {
            await loadStats();
            console.log('✓ loadStats completed');
        } catch(e) {
            console.error('❌ loadStats failed:', e);
        }
        
        try {
            await loadQuotas();
            console.log('✓ loadQuotas completed');
        } catch(e) {
            console.error('❌ loadQuotas failed:', e);
        }
        
        try {
            await loadConnectedAccounts();
            console.log('✓ loadConnectedAccounts completed');
        } catch(e) {
            console.error('❌ loadConnectedAccounts failed:', e);
        }
        
        console.log('=== SETTINGS PAGE LOAD COMPLETE ===');
    } catch(error) {
        console.error('❌ FATAL ERROR in settings page load:', error);
        console.error('Stack:', error.stack);
    }
});

async function loadStats() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/auth/stats', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (response.ok) {
            const stats = await response.json();
            
            // Populate stats with element existence checks
            const statNotes = document.getElementById('statNotes');
            const statSubjects = document.getElementById('statSubjects');
            const statGroups = document.getElementById('statGroups');
            const statQuestions = document.getElementById('statQuestions');
            const statTime = document.getElementById('statTime');
            const statStorage = document.getElementById('statStorage');
            const statStorageLimit = document.getElementById('statStorageLimit');
            
            if (statNotes) statNotes.textContent = stats.notes_uploaded;
            if (statSubjects) statSubjects.textContent = stats.subjects_created;
            if (statGroups) statGroups.textContent = stats.groups_created;
            if (statQuestions) statQuestions.textContent = stats.questions_asked;
            if (statTime) statTime.textContent = `${stats.time_spent_mins} mins`;
            if (statStorage) statStorage.textContent = `${stats.space_used_mb} MB`;
            if (statStorageLimit) statStorageLimit.textContent = stats.storage_limit;
            
            // Populate recent logins
            const loginsList = document.getElementById('recentLoginsList');
            if (loginsList) {
                loginsList.innerHTML = '';
                if (stats.recent_logins && stats.recent_logins.length > 0) {
                    stats.recent_logins.forEach(login => {
                        const li = document.createElement('li');
                        const date = new Date(login.timestamp).toLocaleString();
                        li.textContent = `${date} (IP: ${login.ip_address || 'Unknown'}) - ${login.device_info || 'Unknown Device'}`;
                        loginsList.appendChild(li);
                    });
                } else {
                    loginsList.innerHTML = '<li>No recent logins found</li>';
                }
            }
        }
    } catch (e) {
        console.error('Failed to load stats', e);
    }
}

async function loadQuotas() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/auth/quotas', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (response.ok) {
            const quotaData = await response.json();
            
            // Display tier name
            const tierNameEl = document.getElementById('tierName');
            if (tierNameEl) {
                tierNameEl.textContent = quotaData.tier_name || 'Unknown';
            }
            
            const tierBanner = document.getElementById('tierCardBanner');
            if (tierBanner) {
                tierBanner.style.background = tierGradients[quotaData.tier] || defaultTierGradient;
            }
            const earlyNote = document.getElementById('earlyTesterCallout');
            if (earlyNote) {
                earlyNote.style.display = quotaData.tier === 'early_tester' ? 'block' : 'none';
            }
            
            // Populate quota items
            const quotasContainer = document.getElementById('quotasContainer');
            if (quotasContainer) {
                quotasContainer.innerHTML = '';
            
                const quotaLabels = {
                    'notes': 'Notes',
                    'subjects': 'Subjects',
                    'groups': 'Groups',
                    'conversations': 'Conversations',
                    'messages': 'Messages',
                    'quizzes': 'Quizzes',
                    'summaries': 'Summaries',
                    'storage_gb': 'Storage'
                };
                
                const quotaUnits = {
                    'storage_gb': 'GB'
                };
                
                for (const [key, quota] of Object.entries(quotaData.quotas)) {
                const label = quotaLabels[key] || key;
                const unit = quotaUnits[key] || 'items';
                
                const card = document.createElement('div');
                card.classList.add('quota-card');
                
                const used = quota.used;
                const limit = quota.unlimited ? '∞' : quota.limit;
                const percentage = quota.unlimited ? 100 : Math.round((used / quota.limit) * 100);
                const barColor = percentage > 80 ? '#f5576c' : (percentage > 50 ? '#ffa502' : '#667eea');
                
                // Determine reset period label
                let periodLabel = '';
                if (quota.reset_period === 'week') {
                    periodLabel = ' per week';
                } else if (quota.reset_period === 'month') {
                    periodLabel = ' per month';
                }
                
                let progressBar = '';
                if (!quota.unlimited) {
                    progressBar = `
                        <div style="width: 100%; background: var(--color-card-surface); border-radius: 4px; height: 6px; margin-top: 8px; overflow: hidden;">
                            <div style="width: ${percentage}%; background: ${barColor}; height: 100%;"></div>
                        </div>
                    `;
                }
                
                card.innerHTML = `
                    <div style="font-weight: 600; margin-bottom: 5px;">${label}</div>
                    <div style="font-size: 14px; color: #666;">
                        <strong>${used}</strong> / ${limit} ${unit}${periodLabel}
                    </div>
                    ${progressBar}
                `;
                
                quotasContainer.appendChild(card);
            }
        }
        }
    } catch (e) {
        console.error('Failed to load quotas', e);
    }
}

function loadSettings() {
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const fullNameEl = document.getElementById('fullName');
        const emailEl = document.getElementById('email');
        const nicknameEl = document.getElementById('nickname');
        
        if (fullNameEl) fullNameEl.value = user.full_name || '';
        if (emailEl) emailEl.value = user.email || '';
        if (nicknameEl) nicknameEl.value = user.nickname || user.username || '';

        // Load AI settings
        const useGlobal = user.use_global_ai_config || false;
        const toggle = document.getElementById('globalSettingsToggle');
        const personalContainer = document.getElementById('personalSettingsContainer');
        const globalDisplay = document.getElementById('globalSettingsDisplay');
        
        if (toggle) {
            if (useGlobal) {
                toggle.classList.add('active');
                if (personalContainer) personalContainer.style.display = 'none';
                if (globalDisplay) globalDisplay.style.display = 'block';
            } else {
                toggle.classList.remove('active');
                if (personalContainer) personalContainer.style.display = 'grid';
                if (globalDisplay) globalDisplay.style.display = 'none';
                
                // Load personal settings
                const aiProviderEl = document.getElementById('aiProvider');
                const aiModelEl = document.getElementById('aiModel');
                const aiBaseUrlEl = document.getElementById('aiBaseUrl');
                const aiApiKeyEl = document.getElementById('aiApiKey');
                window.hasStoredAiApiKey = !!user.ai_api_key;
                
                if (aiProviderEl) aiProviderEl.value = user.ai_provider || 'gemini';
                if (aiModelEl) aiModelEl.value = user.ai_model || '';
                if (aiBaseUrlEl) aiBaseUrlEl.value = user.ai_base_url || '';
                if (aiApiKeyEl) aiApiKeyEl.value = ''; // Never show saved API keys
            }
        }

        toggleAIFields();
    } catch(error) {
        console.error('Error in loadSettings:', error);
    }
}

function toggleGlobalSettings() {
    try {
        const toggle = document.getElementById('globalSettingsToggle');
        const personalContainer = document.getElementById('personalSettingsContainer');
        const globalDisplay = document.getElementById('globalSettingsDisplay');
        
        if (!toggle || !personalContainer || !globalDisplay) {
            console.debug('toggleGlobalSettings: required elements not found');
            return;
        }
        
        toggle.classList.toggle('active');
        
        if (toggle.classList.contains('active')) {
            // Switch to global settings
            personalContainer.style.display = 'none';
            globalDisplay.style.display = 'block';
        } else {
            // Switch to personal settings
            personalContainer.style.display = 'grid';
            globalDisplay.style.display = 'none';
        }
    } catch(error) {
        console.error('Error in toggleGlobalSettings:', error);
    }
}

function toggleAIFields() {
    try {
        const aiProviderEl = document.getElementById('aiProvider');
        if (!aiProviderEl) {
            console.debug('toggleAIFields: aiProvider element not found');
            return;
        }
        
        const provider = aiProviderEl.value;
        const baseUrlGroup = document.getElementById('aiBaseUrlGroup');
        const apiKeyHelp = document.getElementById('apiKeyHelp');

        if (!baseUrlGroup || !apiKeyHelp) {
            console.debug('toggleAIFields: baseUrlGroup or apiKeyHelp element not found');
            return;
        }

        const requiresBaseUrl = ['ollama', 'local_modal', 'openrouter'].includes(provider);
        const requiresApiKey = ['gemini', 'huggingface', 'chatgpt', 'claude', 'openrouter'].includes(provider);

        if (requiresBaseUrl) {
            baseUrlGroup.style.display = 'block';
            if (provider === 'openrouter') {
                apiKeyHelp.textContent = 'Required for OpenRouter. Base URL is usually left default.';
            } else {
                apiKeyHelp.textContent = `Optional for ${provider}`;
            }
        } else {
            baseUrlGroup.style.display = 'none';
            apiKeyHelp.textContent = requiresApiKey ? 'Required for this provider' : 'Optional';
        }
    } catch(error) {
        console.error('Error in toggleAIFields:', error);
    }
}

async function updateProfile(event) {
    event.preventDefault();
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            showErrorModal('Error', 'Session expired. Please login again.');
            window.location.href = '/login';
            return;
        }
        
        const fullName = document.getElementById('fullName').value.trim();
        const nickname = document.getElementById('nickname').value.trim();
        if (!fullName || !nickname) {
            showErrorModal('Validation Error', 'Full name and nickname are required.');
            return;
        }

        const payload = {
            full_name: fullName,
            nickname: nickname
        };
        
        const response = await fetch('/auth/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            const updatedUser = await response.json();
            localStorage.setItem('user', JSON.stringify(updatedUser));
            showSuccessModal('Profile Saved', 'Your profile information has been updated successfully.');
        } else {
            const error = await response.json();
            showErrorModal('Error', error.detail || 'Failed to save profile');
        }
    } catch (error) {
        showErrorModal('Error', error.message || 'Failed to update profile');
    }
}

function toggleAnalytics() {
    const toggle = event.target;
    toggle.classList.toggle('active');
}

function toggleNotifications() {
    const toggle = event.target;
    toggle.classList.toggle('active');
}

async function saveAiConfiguration(event) {
    if (event) event.preventDefault();

    try {
        const token = localStorage.getItem('token');
        if (!token) {
            showErrorModal('Error', 'Session expired. Please login again.');
            window.location.href = '/login';
            return;
        }

        const useGlobal = document.getElementById('globalSettingsToggle').classList.contains('active');
        const payload = {
            use_global_ai_config: useGlobal
        };

        if (!useGlobal) {
            const provider = document.getElementById('aiProvider').value;
            const apiKey = document.getElementById('aiApiKey').value.trim();
            const baseUrl = document.getElementById('aiBaseUrl').value.trim();
            const model = document.getElementById('aiModel').value.trim();

            const requiresBaseUrl = ['ollama', 'local_modal'].includes(provider);
            const requiresApiKey = ['gemini', 'huggingface', 'chatgpt', 'claude', 'openrouter'].includes(provider);
            const hasAnyApiKey = apiKey.length > 0 || window.hasStoredAiApiKey;

            if (requiresBaseUrl && !baseUrl) {
                showErrorModal('Validation Error', `Base URL is required for ${provider}`);
                return;
            }
            if (requiresApiKey && !hasAnyApiKey) {
                showErrorModal('Validation Error', `API Key is required for ${provider}`);
                return;
            }

            payload.ai_provider = provider;
            payload.ai_model = model || null;
            payload.ai_base_url = baseUrl || null;
            if (apiKey) {
                payload.ai_api_key = apiKey;
            }
        }

        const response = await fetch('/auth/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const updatedUser = await response.json();
            localStorage.setItem('user', JSON.stringify(updatedUser));
            if (payload.ai_api_key) {
                window.hasStoredAiApiKey = true;
            }
            showSuccessModal('AI Configuration Saved', 'Your AI settings have been updated successfully.');
        } else {
            const error = await response.json();
            showErrorModal('Error', error.detail || 'Failed to save AI configuration');
        }
    } catch (error) {
        showErrorModal('Error', error.message || 'Failed to save AI configuration');
    }
}

function showFeatureComingSoon() {
    showErrorModal('Coming Soon', 'This feature will be available in a future update.');
}

function clearCache() {
    localStorage.clear();
    showSuccessModal('Cache Cleared', 'Your cache has been cleared. Redirecting to login...');
    setTimeout(() => {
        window.location.href = '/login';
    }, 2000);
}

async function changePassword() {
    if (typeof window.userHasPassword !== 'boolean') {
        await loadConnectedAccounts();
    }

    const hasPassword = !!window.userHasPassword;
    const current = document.getElementById('currentPassword').value;
    const newPass = document.getElementById('newPassword').value;
    const confirm = document.getElementById('confirmPassword').value;

    if (!newPass || !confirm || (hasPassword && !current)) {
        showMessageInElement(
            'passwordMsg',
            'error',
            hasPassword ? 'Please fill in all password fields' : 'Please fill in new password and confirm password'
        );
        return;
    }

    if (newPass !== confirm) {
        showMessageInElement('passwordMsg', 'error', 'Passwords do not match');
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/auth/request-password-change', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                current_password: hasPassword ? current : '',
                new_password: newPass
            })
        });
        
        if (res.ok) {
            const data = await res.json();
            showMessageInElement('passwordMsg', 'success', data.message);
            document.getElementById('currentPassword').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmPassword').value = '';
            
            // Show confirmation code modal after 2 seconds
            setTimeout(() => {
                document.getElementById('passwordChangeConfirmationModal').style.display = 'flex';
                document.getElementById('passwordChangeCode').focus();
            }, 2000);
        } else {
            const error = await res.json();
            showMessageInElement('passwordMsg', 'error', error.detail || 'Failed to request password change');
        }
    } catch(err) {
        showMessageInElement('passwordMsg', 'error', err.message || 'Failed to request password change');
    }
}

function showPasswordSetForm() {
    document.getElementById('passwordSetButtons').style.display = 'none';
    document.getElementById('passwordSetForm').style.display = 'block';
    document.getElementById('warningSetPassword').focus();
}

async function setPasswordFromWarningModal() {
    const newPass = document.getElementById('warningSetPassword').value;
    const confirm = document.getElementById('warningConfirmPassword').value;
    const msgBox = document.getElementById('passwordSetMsg');
    
    if (!newPass || !confirm) {
        showMessageInBox(msgBox, 'error', 'Please fill in all fields');
        return;
    }
    
    if (newPass !== confirm) {
        showMessageInBox(msgBox, 'error', 'Passwords do not match');
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        // For setting password from warning modal, we don't need current password verification
        // since the user doesn't have one yet. We'll use an empty string.
        const res = await fetch('/auth/request-password-change', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                current_password: '',  // Empty since user has no password yet
                new_password: newPass
            })
        });
        
        if (res.ok) {
            const data = await res.json();
            // Continue unlink flow after password verification succeeds.
            pendingUnlinkAfterPasswordSetup = true;
            // Show confirmation code modal
            document.getElementById('passwordChangeCode').value = '';
            document.getElementById('passwordChangeMsg').innerHTML = '';
            document.getElementById('passwordChangeConfirmationModal').style.display = 'flex';
            document.getElementById('passwordChangeCode').focus();
        } else {
            const error = await res.json();
            
            // If error is about empty current password, it might be a different flow
            if (error.detail && error.detail.includes('current password')) {
                showMessageInBox(msgBox, 'error', 'There was an issue setting your password. Please try again.');
            } else {
                showMessageInBox(msgBox, 'error', error.detail || 'Failed to set password');
            }
        }
    } catch(e) {
        console.error('Error setting password:', e);
        showMessageInBox(msgBox, 'error', e.message || 'Failed to set password');
    }
}

function closePasswordChangeConfirmationModal(keepFlow = false) {
    document.getElementById('passwordChangeConfirmationModal').style.display = 'none';
    if (!keepFlow) {
        pendingUnlinkAfterPasswordSetup = false;
    }
}

async function confirmPasswordChange() {
    const code = document.getElementById('passwordChangeCode').value;
    const msgBox = document.getElementById('passwordChangeMsg');
    
    if (!code) {
        showMessageInBox(msgBox, 'error', 'Please enter the confirmation code');
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/auth/confirm-password-change', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                confirmation_code: code
            })
        });
        
        if (res.ok) {
            showMessageInBox(msgBox, 'success', 'Password changed successfully!');
            window.userHasPassword = true;
            updateSecurityPasswordMode(true);
            await loadConnectedAccounts();
            showSuccessModal('Password Updated', 'Your password has been verified and saved successfully.');
            const continueUnlinkFlow = pendingUnlinkAfterPasswordSetup;
            setTimeout(() => {
                closePasswordChangeConfirmationModal(true);
                closeNeedPasswordWarningModal(true);
                // Clear all password fields
                document.getElementById('currentPassword').value = '';
                document.getElementById('newPassword').value = '';
                document.getElementById('confirmPassword').value = '';
                document.getElementById('warningSetPassword').value = '';
                document.getElementById('warningConfirmPassword').value = '';

                if (continueUnlinkFlow) {
                    document.getElementById('unlinkGooglePassword').value = '';
                    document.getElementById('unlinkGoogleMsg').innerHTML = '<div class="message-box-success">Password verified. Please enter it again to unlink your Google account.</div>';
                    document.getElementById('unlinkGoogleModal').style.display = 'flex';
                    document.getElementById('unlinkGooglePassword').focus();
                }
                pendingUnlinkAfterPasswordSetup = false;
            }, 1500);
        } else {
            const error = await res.json();
            showMessageInBox(msgBox, 'error', error.detail || 'Failed to confirm password change');
        }
    } catch(e) {
        console.error('Error confirming password:', e);
        showMessageInBox(msgBox, 'error', e.message || 'Failed to confirm password change');
    }
}

function showMessageInElement(elementId, type, message) {
    const element = document.getElementById(elementId);
    if (!element) return;
    element.innerHTML = `<div class="message-box-${type}">${message}</div>`;
}

async function downloadData() {
    showErrorModal('Coming Soon', 'This feature will be available in a future update.');
}

function confirmDeleteAccount() {
    showConfirmModal(
        'Are you absolutely sure? This will permanently delete your account and all your data. This cannot be undone.',
        deleteAccount
    );
}

async function deleteAccount() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/auth/profile', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (res.ok) {
            showSuccessModal('Account Deleted', 'Your account has been deleted. Redirecting to login...');
            setTimeout(() => {
                localStorage.clear();
                window.location.href = '/login';
            }, 2000);
        } else {
            const error = await res.json();
            showErrorModal('Error', error.detail || 'Failed to delete account');
        }
    } catch(err) {
        showErrorModal('Error', err.message || 'Failed to delete account');
    }
}

// --- Google Account Linking ---

async function loadConnectedAccounts() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/auth/connected-accounts', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            const googleLinked = data.google_linked;
            const hasPassword = data.has_password;
            
            // Store password status in global for modal access
            window.userHasPassword = hasPassword;
            updateSecurityPasswordMode(hasPassword);
            
            // Update UI based on linked status
            const linkBtn = document.getElementById('linkGoogleBtn');
            const unlinkBtn = document.getElementById('unlinkGoogleBtn');
            const googleStatus = document.getElementById('googleStatus');
            
            if (googleLinked) {
                googleStatus.textContent = 'Connected';
                googleStatus.style.color = '#34A853';
                linkBtn.style.display = 'none';
                unlinkBtn.style.display = 'block';
            } else {
                googleStatus.textContent = 'Not connected';
                googleStatus.style.color = 'var(--color-gray)';
                if (hasPassword) {
                    linkBtn.style.display = 'block';
                } else {
                    linkBtn.style.display = 'none';
                }
                unlinkBtn.style.display = 'none';
            }
        }
    } catch (e) {
        console.error('Failed to load connected accounts', e);
    }
}

function updateSecurityPasswordMode(hasPassword) {
    const currentGroup = document.getElementById('currentPasswordGroup');
    const currentLabel = document.getElementById('currentPasswordLabel');
    const currentInput = document.getElementById('currentPassword');
    const actionBtn = document.getElementById('securityPasswordActionBtn');
    const hint = document.getElementById('securityPasswordHint');

    if (!currentGroup || !currentLabel || !currentInput || !actionBtn || !hint) return;

    if (hasPassword) {
        currentGroup.style.display = '';
        currentLabel.textContent = 'Current Password';
        actionBtn.textContent = 'Change Password';
        hint.textContent = 'Use your current password to set a new one. A verification code will be sent to your email.';
        return;
    }

    currentGroup.style.display = 'none';
    currentInput.value = '';
    actionBtn.textContent = 'Set Password';
    hint.textContent = 'Set a password for your account. A verification code will be sent to your email before it is saved.';
}

function showLinkGoogleModal() {
    document.getElementById('linkGooglePassword').value = '';
    document.getElementById('linkGoogleMsg').innerHTML = '';
    document.getElementById('linkGoogleModal').style.display = 'flex';
    document.getElementById('linkGooglePassword').focus();
}

function closeLinkGoogleModal() {
    document.getElementById('linkGoogleModal').style.display = 'none';
}

function showGoogleLinkSuccessModal(googleEmail = '') {
    const modal = document.getElementById('googleLinkSuccessModal');
    const emailText = document.getElementById('googleLinkSuccessEmail');
    if (!modal || !emailText) return;

    if (googleEmail) {
        emailText.textContent = `Linked Google account: ${googleEmail}`;
        emailText.style.display = 'block';
    } else {
        emailText.textContent = '';
        emailText.style.display = 'none';
    }

    modal.style.display = 'flex';
}

function closeGoogleLinkSuccessModal() {
    const modal = document.getElementById('googleLinkSuccessModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function linkGoogleAccount() {
    const password = document.getElementById('linkGooglePassword').value;
    const msgBox = document.getElementById('linkGoogleMsg');
    
    if (!password) {
        showMessageInBox(msgBox, 'error', 'Please enter your password');
        return;
    }
    
    try {
        // Get JWT token from localStorage
        const token = localStorage.getItem('token');
        if (!token) {
            showMessageInBox(msgBox, 'error', 'Session expired. Please login again.');
            window.location.href = '/login';
            return;
        }
        
        // Wait for Firebase to be initialized
        if (!window.firebaseAuth || !window.googleProvider) {
            showMessageInBox(msgBox, 'error', 'Firebase not initialized. Please refresh the page.');
            return;
        }
        
        // Get a fresh Google provider
        const provider = new window.GoogleAuthProvider();
        provider.addScope('profile');
        provider.addScope('email');
        provider.setCustomParameters({ prompt: 'select_account' });
        
        console.log('Starting Google account linking via popup...');
        
        // Use signInWithPopup (NOT linkWithPopup) - same pattern as login.html
        const result = await window.signInWithPopup(window.firebaseAuth, provider);
        console.log('✓ Google popup flow completed');
        
        const idToken = await result.user.getIdToken();
        console.log('✓ Got Google ID token');
        
        // Send to backend's new link-google-via-popup endpoint
        console.log('Calling /auth/link-google-via-popup with idToken and password...');
        const res = await fetch('/auth/link-google-via-popup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                idToken: idToken,
                password: password
            })
        });
        
        if (res.ok) {
            const data = await res.json();
            console.log('✓ Backend confirmed linking:', data);
            closeLinkGoogleModal();
            await loadConnectedAccounts();
            showGoogleLinkSuccessModal(data.google_email || result.user?.email || '');
        } else {
            const err = await res.json();
            console.error('Backend error:', err);
            showMessageInBox(msgBox, 'error', err.detail || 'Failed to link Google account');
            // Don't sign out - user can try again
        }
    } catch (e) {
        console.error('Linking error:', e);
        if (e.code === 'auth/popup-closed-by-user') {
            // User closed the popup - don't show error, they know what happened
            console.log('User cancelled Google popup');
        } else if (e.code === 'auth/permission-denied') {
            showMessageInBox(msgBox, 'error', 'Permission denied. Please try again.');
        } else {
            showMessageInBox(msgBox, 'error', e.message || 'Failed to link Google account. Please try again.');
        }
    }
}

async function showUnlinkGoogleModal() {
    // Refresh account state first so UI does not require manual page refresh
    try {
        await loadConnectedAccounts();
    } catch (e) {
        console.warn('Could not refresh connected account state before unlink check', e);
    }

    // Check if user has password set
    if (!window.userHasPassword) {
        // Show warning modal instead
        showNeedPasswordWarningModal();
        return;
    }
    
    // User has password, show normal unlink confirmation modal
    document.getElementById('unlinkGooglePassword').value = '';
    document.getElementById('unlinkGoogleMsg').innerHTML = '';
    document.getElementById('unlinkGoogleModal').style.display = 'flex';
    document.getElementById('unlinkGooglePassword').focus();
}

function showNeedPasswordWarningModal() {
    pendingUnlinkAfterPasswordSetup = false;
    document.getElementById('needPasswordWarningModal').style.display = 'flex';
}

function closeNeedPasswordWarningModal(keepFlow = false) {
    const msgBox = document.getElementById('passwordSetMsg');
    const buttons = document.getElementById('passwordSetButtons');
    const form = document.getElementById('passwordSetForm');
    const warningSetPassword = document.getElementById('warningSetPassword');
    const warningConfirmPassword = document.getElementById('warningConfirmPassword');

    document.getElementById('needPasswordWarningModal').style.display = 'none';
    if (!keepFlow) {
        pendingUnlinkAfterPasswordSetup = false;
    }
    if (msgBox) msgBox.innerHTML = '';
    if (buttons) buttons.style.display = 'flex';
    if (form) form.style.display = 'none';
    if (warningSetPassword) warningSetPassword.value = '';
    if (warningConfirmPassword) warningConfirmPassword.value = '';
}

function closeUnlinkGoogleModal() {
    document.getElementById('unlinkGoogleModal').style.display = 'none';
}

async function unlinkGoogleAccount() {
    const password = document.getElementById('unlinkGooglePassword').value;
    const msgBox = document.getElementById('unlinkGoogleMsg');
    
    if (!password) {
        showMessageInBox(msgBox, 'error', 'Please enter your password');
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            showMessageInBox(msgBox, 'error', 'Session expired. Please login again.');
            window.location.href = '/login';
            return;
        }
        
        const res = await fetch('/auth/unlink-google-account', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ password: password })
        });
        
        if (res.ok) {
            showMessageInBox(msgBox, 'success', 'Google account unlinked successfully!');
            setTimeout(() => {
                closeUnlinkGoogleModal();
                loadConnectedAccounts();
            }, 1500);
        } else {
            const err = await res.json();
            showMessageInBox(msgBox, 'error', err.detail || 'Failed to unlink Google account');
        }
    } catch (e) {
        console.error('Error unlinking Google:', e);
        showMessageInBox(msgBox, 'error', e.message || 'Failed to unlink Google account');
    }
}

// Helper function to show messages in message boxes
function showMessageInBox(element, type, message) {
    element.innerHTML = `<div class="message-box-${type}">${message}</div>`;
}