const API_URL = '';
const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || '{}');

window.addEventListener('load', () => {
    if (!token) window.location.href = 'login.html';
    loadSettings();
    loadStats();
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
            document.getElementById('statQuota').textContent = stats.quota;
            
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
                alert(`Base URL is required for ${provider}`);
                return;
            }
            if (requiresApiKey && !apiKey) {
                alert(`API Key is required for ${provider}`);
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
            alert('✓ AI configuration saved successfully');
            location.reload(); // Reload to reflect changes
        } else {
            const error = await response.json();
            alert('Error: ' + (error.detail || 'Failed to save settings'));
        }
    } catch (error) {
        alert('Error updating profile: ' + error.message);
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

function clearCache() {
    localStorage.clear();
    alert('Cache cleared');
    window.location.href = 'login.html';
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
    try {
        const res = await fetch('/auth/download-data', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to fetch data');
        
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mysmartnotes_export.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch(err) {
        alert('Error downloading data: ' + err.message);
    }
}

async function deleteAccount() {
    if (!confirm('Are you sure? This cannot be undone.')) return;
    if (!confirm('This will permanently delete all your data. Are you absolutely sure?')) return;

    try {
        const res = await fetch('/auth/profile', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (res.ok) {
            alert('Account deleted successfully.');
            localStorage.clear();
            window.location.href = '/login.html';
        } else {
            const error = await res.json();
            alert('Error: ' + error.detail);
        }
    } catch(err) {
        alert('Error: ' + err.message);
    }
}