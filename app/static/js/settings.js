const API_URL = '';
const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || '{}');

window.addEventListener('load', () => {
    if (!token) window.location.href = 'login.html';
    loadSettings();
});

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

    if (provider === 'ollama') {
        baseUrlGroup.style.display = 'block';
        apiKeyHelp.textContent = 'Optional for Ollama (only if your server requires authentication)';
    } else {
        baseUrlGroup.style.display = 'none';
        apiKeyHelp.textContent = 'Required for Gemini and Hugging Face';
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
            if (provider === 'ollama' && !baseUrl) {
                alert('Base URL is required for Ollama provider');
                return;
            }
            if ((provider === 'gemini' || provider === 'huggingface') && !apiKey) {
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

function changePassword() {
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

    alert('Password change feature coming soon');
}

function downloadData() {
    alert('Download data feature coming soon');
}

function deleteAccount() {
    if (!confirm('Are you sure? This cannot be undone.')) return;
    if (!confirm('This will permanently delete all your data. Are you absolutely sure?')) return;

    alert('Account deletion coming soon');
}