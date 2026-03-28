const API_URL = '';

const tierGradients = {
    unlimited: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    free: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    pro: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    early_tester: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)'
};
const defaultTierGradient = tierGradients.unlimited;

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
        
        const useGlobal = document.getElementById('globalSettingsToggle').classList.contains('active');
        
        const payload = {
            full_name: document.getElementById('fullName').value,
            nickname: document.getElementById('nickname').value,
            use_global_ai_config: useGlobal
        };
        
        // Only include personal settings if not using global
        if (!useGlobal) {
            const provider = document.getElementById('aiProvider').value;
            const apiKey = document.getElementById('aiApiKey').value;
            const baseUrl = document.getElementById('aiBaseUrl').value;
            const model = document.getElementById('aiModel').value;
            
            // Validation
            const requiresBaseUrl = ['ollama', 'local_modal'].includes(provider);
            const requiresApiKey = ['gemini', 'huggingface', 'chatgpt', 'claude', 'openrouter'].includes(provider);

            if (requiresBaseUrl && !baseUrl) {
                showErrorModal('Validation Error', `Base URL is required for ${provider}`);
                return;
            }
            if (requiresApiKey && !apiKey) {
                showErrorModal('Validation Error', `API Key is required for ${provider}`);
                return;
            }
            
            payload.ai_provider = provider;
            payload.ai_model = model || null;
            payload.ai_base_url = baseUrl || null;
            payload.ai_api_key = apiKey || null;
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
            showSuccessModal('Configuration Saved', 'Your AI configuration has been saved successfully.');
            setTimeout(() => {
                location.reload();
            }, 2000);
        } else {
            const error = await response.json();
            showErrorModal('Error', error.detail || 'Failed to save settings');
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

function saveAiConfiguration() {
    updateProfile(new Event('submit', { bubbles: true }));
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
    const current = document.getElementById('currentPassword').value;
    const newPass = document.getElementById('newPassword').value;
    const confirm = document.getElementById('confirmPassword').value;

    if (!current || !newPass || !confirm) {
        alert('Please fill in all password fields');
        return;
    }

    if (newPass !== confirm) {
        alert('Passwords do not match');
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/auth/change-password', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                current_password: current,
                new_password: newPass
            })
        });
        
        if (res.ok) {
            alert('Password changed successfully');
            document.getElementById('currentPassword').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmPassword').value = '';
        } else {
            const error = await res.json();
            alert('Error: ' + error.detail);
        }
    } catch(err) {
        alert('Error: ' + err.message);
    }
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
                linkBtn.style.display = 'block';
                unlinkBtn.style.display = 'none';
            }
        }
    } catch (e) {
        console.error('Failed to load connected accounts', e);
    }
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

async function linkGoogleAccount() {
    const password = document.getElementById('linkGooglePassword').value;
    const msgBox = document.getElementById('linkGoogleMsg');
    
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
        
        // Get Google ID token
        if (!window.firebaseAuth || !window.googleProvider) {
            showMessageInBox(msgBox, 'error', 'Google authentication not initialized');
            return;
        }
        
        const result = await window.signInWithPopup(window.firebaseAuth, window.googleProvider);
        const user = result.user;
        const idToken = await user.getIdToken();
        
        // Send to backend
        const res = await fetch('/auth/link-google-account', {
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
            showMessageInBox(msgBox, 'success', 'Google account linked successfully!');
            setTimeout(() => {
                closeLinkGoogleModal();
                loadConnectedAccounts();
            }, 1500);
        } else {
            const err = await res.json();
            showMessageInBox(msgBox, 'error', err.detail || 'Failed to link Google account');
            // Sign out from Firebase on error
            window.firebaseAuth.signOut();
        }
    } catch (e) {
        if (e.code === 'auth/popup-closed-by-user') {
            showMessageInBox(msgBox, 'error', 'Google sign-in was cancelled');
        } else {
            console.error('Error linking Google:', e);
            showMessageInBox(msgBox, 'error', e.message || 'Failed to link Google account');
        }
    }
}

function showUnlinkGoogleModal() {
    document.getElementById('unlinkGooglePassword').value = '';
    document.getElementById('unlinkGoogleMsg').innerHTML = '';
    document.getElementById('unlinkGoogleModal').style.display = 'flex';
    document.getElementById('unlinkGooglePassword').focus();
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