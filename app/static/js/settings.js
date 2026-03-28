const API_URL = '';
const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || '{}');

window.addEventListener('load', () => {
    if (!token) window.location.href = '/login';
    loadSettings();
    loadStats();
    loadQuotas();
});

async function loadStats() {
    try {
        const response = await fetch('/auth/stats', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (response.ok) {
            const stats = await response.json();
            
            // Populate stats
            document.getElementById('statNotes').textContent = stats.notes_uploaded;
            document.getElementById('statSubjects').textContent = stats.subjects_created;
            document.getElementById('statGroups').textContent = stats.groups_created;
            document.getElementById('statQuestions').textContent = stats.questions_asked;
            document.getElementById('statTime').textContent = `${stats.time_spent_mins} mins`;
            document.getElementById('statStorage').textContent = `${stats.space_used_mb} MB`;
            document.getElementById('statStorageLimit').textContent = stats.storage_limit;
            
            // Populate recent logins
            const loginsList = document.getElementById('recentLoginsList');
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
    } catch (e) {
        console.error('Failed to load stats', e);
    }
}

async function loadQuotas() {
    try {
        const response = await fetch('/auth/quotas', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (response.ok) {
            const quotaData = await response.json();
            
            // Display tier name
            document.getElementById('tierName').textContent = quotaData.tier_name || 'Unknown';
            const earlyNote = document.getElementById('earlyTesterCallout');
            if (earlyNote) {
                earlyNote.style.display = quotaData.tier === 'early_tester' ? 'block' : 'none';
            }
            
            // Populate quota items
            const quotasContainer = document.getElementById('quotasContainer');
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
                card.style.cssText = 'background: #f5f5f5; padding: 15px; border-radius: 8px;';
                
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
                        <div style="width: 100%; background: #ddd; border-radius: 4px; height: 6px; margin-top: 8px; overflow: hidden;">
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
    } catch (e) {
        console.error('Failed to load quotas', e);
    }
}

function loadSettings() {
    document.getElementById('fullName').value = user.full_name || '';
    document.getElementById('email').value = user.email || '';
    document.getElementById('nickname').value = user.nickname || user.username || '';

    // Load AI settings
    const useGlobal = user.use_global_ai_config || false;
    const toggle = document.getElementById('globalSettingsToggle');
    const personalContainer = document.getElementById('personalSettingsContainer');
    const globalDisplay = document.getElementById('globalSettingsDisplay');
    
    if (useGlobal) {
        toggle.classList.add('active');
        personalContainer.style.display = 'none';
        globalDisplay.style.display = 'block';
    } else {
        toggle.classList.remove('active');
        personalContainer.style.display = 'grid';
        globalDisplay.style.display = 'none';
        
        // Load personal settings
        document.getElementById('aiProvider').value = user.ai_provider || 'gemini';
        document.getElementById('aiModel').value = user.ai_model || '';
        document.getElementById('aiBaseUrl').value = user.ai_base_url || '';
        document.getElementById('aiApiKey').value = ''; // Never show saved API keys
    }

    toggleAIFields();
}

function toggleGlobalSettings() {
    const toggle = document.getElementById('globalSettingsToggle');
    const personalContainer = document.getElementById('personalSettingsContainer');
    const globalDisplay = document.getElementById('globalSettingsDisplay');
    
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
}

function toggleAIFields() {
    const provider = document.getElementById('aiProvider').value;
    const baseUrlGroup = document.getElementById('aiBaseUrlGroup');
    const apiKeyHelp = document.getElementById('apiKeyHelp');

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
}

async function updateProfile(event) {
    event.preventDefault();
    try {
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