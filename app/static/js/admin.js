const API_URL = '';
const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || '{}');

window.addEventListener('load', () => {
    if (!token || !user.is_admin) {
        alert('Unauthorized access');
        window.location.href = 'dashboard.html';
        return;
    }
    
    // Initial fetch for the active tab
    loadUsers();
});

function switchTab(tabId) {
    document.querySelectorAll('.admin-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    event.target.classList.add('active');
    
    // Load data based on tab
    if (tabId === 'tab-users') loadUsers();
    if (tabId === 'tab-invitations') loadInvitations();
    if (tabId === 'tab-settings') loadSystemSettings();
    if (tabId === 'tab-rate-limits') loadRateLimits();
    if (tabId === 'tab-email') loadEmailConfig();
    if (tabId === 'tab-ip') loadIpFilters();
    if (tabId === 'tab-logs') loadLogs();
    if (tabId === 'tab-database') loadDbTables();
}

// ========================
// DATABASE INSPECTOR
// ========================
async function loadDbTables() {
    try {
        const tables = await apiCall('/admin/db/tables');
        const select = document.getElementById('dbTableSelect');
        const currentValue = select.value;
        
        select.innerHTML = '<option value="">-- Select Table --</option>';
        tables.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            select.appendChild(opt);
        });
        
        if (currentValue && tables.includes(currentValue)) {
            select.value = currentValue;
        }
    } catch (e) { console.error('Error loading tables', e); }
}

async function loadTableData() {
    const table = document.getElementById('dbTableSelect').value;
    if (!table) return;
    
    const thead = document.querySelector('#dbDataTable thead');
    const tbody = document.querySelector('#dbDataTable tbody');
    const stats = document.getElementById('dbTableStats');
    
    thead.innerHTML = '<tr><th>Loading...</th></tr>';
    tbody.innerHTML = '<tr><td>Fetching data from ' + table + '...</td></tr>';
    
    try {
        const res = await apiCall(`/admin/db/table/${table}`);
        
        // Build Header
        let headerHtml = '<tr>';
        res.columns.forEach(col => {
            headerHtml += `<th>${col}</th>`;
        });
        headerHtml += '</tr>';
        thead.innerHTML = headerHtml;
        
        // Build Rows
        if (res.data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${res.columns.length}">No records found in this table.</td></tr>`;
        } else {
            let bodyHtml = '';
            res.data.forEach(row => {
                bodyHtml += '<tr>';
                res.columns.forEach(col => {
                    let val = row[col];
                    if (val === null) val = '<em style="color:var(--color-gray)">null</em>';
                    else if (typeof val === 'object') val = JSON.stringify(val);
                    else if (typeof val === 'string' && val.length > 200) val = val.substring(0, 197) + '...';
                    
                    bodyHtml += `<td>${val}</td>`;
                });
                bodyHtml += '</tr>';
            });
            tbody.innerHTML = bodyHtml;
        }
        
        stats.textContent = `Showing ${res.data.length} records from table: ${table}`;
        
    } catch (e) {
        thead.innerHTML = '<tr><th style="color:red">Error</th></tr>';
        tbody.innerHTML = `<tr><td>Failed to load data: ${e.message}</td></tr>`;
        console.error(e);
    }
}

async function apiCall(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    };
    if (body) options.body = JSON.stringify(body);
    
    const res = await fetch(API_URL + endpoint, options);
    if (!res.ok) {
        let err = 'API Error';
        try { err = (await res.json()).detail; } catch (e) {}
        throw new Error(err);
    }
    return res.json();
}

// ========================
// USERS
// ========================
async function loadUsers() {
    try {
        const users = await apiCall('/admin/users');
        const tbody = document.querySelector('#usersTable tbody');
        tbody.innerHTML = '';
        
        users.forEach(u => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${u.id}</td>
                <td>${u.nickname || '-'}</td>
                <td>${u.full_name || '-'}</td>
                <td>${u.email}</td>
                <td>${u.notes_count} / ${u.subjects_count} / ${u.groups_count}</td>
                <td>${u.conversations_count} / ${u.questions_count}</td>
                <td>${u.storage_used}</td>
                <td>${u.total_logins} / ${u.total_online_time}m</td>
                <td><span class="badge ${u.tier === 'pro' ? 'pro' : 'free'}">${u.tier}</span></td>
                <td>
                    ${u.is_active ? '<span style="color:green">Active</span>' : '<span style="color:red">Inactive</span>'}
                    <br>
                    ${u.is_admin ? '<span style="color:purple;font-size:12px">Admin</span>' : ''}
                </td>
                <td>
                    <button class="action-btn" onclick="userAction(${u.id}, 'tier', '${u.tier === "pro" ? "free" : "pro"}')">Toggle Tier</button>
                    ${u.is_active 
                        ? `<button class="action-btn" onclick="userAction(${u.id}, 'deactivate')">Deactivate</button>` 
                        : `<button class="action-btn" onclick="userAction(${u.id}, 'activate')">Activate</button>`}
                    <button class="action-btn" onclick="userAction(${u.id}, 'reset_password', prompt('New Password:'))">Reset Pwd</button>
                    <button class="action-btn" style="color:red" onclick="if(confirm('Delete user completely?')) userAction(${u.id}, 'delete')">Delete</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { alert(e.message); }
}

async function userAction(userId, action, value = null) {
    if (value === null && action === 'reset_password') return; // Cancelled prompt
    try {
        await apiCall('/admin/users/action', 'POST', { user_id: userId, action, value });
        loadUsers(); // refresh
    } catch (e) { alert(e.message); }
}

// ========================
// INVITATIONS
// ========================
function openInviteModal() {
    document.getElementById('inviteModal').style.display = 'flex';
}

function closeInviteModal() {
    document.getElementById('inviteModal').style.display = 'none';
}

async function sendInvite(e) {
    e.preventDefault();
    const email = document.getElementById('inviteEmail').value;
    const tier = document.getElementById('inviteTier').value;
    
    try {
        const res = await apiCall('/admin/invitations', 'POST', { email, tier });
        alert(`Invitation link created and sent to ${email}:\n\n${res.invitation_link}`);
        closeInviteModal();
        loadInvitations();
    } catch (err) {
        alert(err.message);
    }
}

async function loadInvitations() {
    try {
        const invites = await apiCall('/admin/invitations');
        const tbody = document.querySelector('#invitationsTable tbody');
        tbody.innerHTML = '';
        
        if (invites.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No pending invitations</td></tr>';
            return;
        }
        
        invites.forEach(i => {
            const tr = document.createElement('tr');
            const expires = new Date(i.expires_at).toLocaleString();
            tr.innerHTML = `
                <td>${i.email}</td>
                <td><code>${i.token.substring(0, 8)}...</code></td>
                <td>${i.tier}</td>
                <td><small>${i.invitation_link}</small></td>
                <td>${expires}</td>
                <td>${i.is_used ? '<span style="color:green">Used</span>' : '<span style="color:orange">Pending</span>'}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error(e); }
}

// ========================
// SYSTEM SETTINGS
// ========================
async function loadSystemSettings() {
    try {
        const s = await apiCall('/admin/system-settings');
        const lockdownToggle = document.getElementById('lockdownToggle');
        const maintenanceToggle = document.getElementById('maintenanceToggle');

        if (s.lockdown_mode) lockdownToggle.classList.add('active');
        else lockdownToggle.classList.remove('active');
        
        if (s.maintenance_mode) maintenanceToggle.classList.add('active');
        else maintenanceToggle.classList.remove('active');
        
        document.getElementById('signupConfig').value = s.signup_config || 'open';
        document.getElementById('domainUrl').value = s.domain_url || '';
        document.getElementById('footerText').value = s.footer_text || '';
        document.getElementById('globalAiProvider').value = s.global_ai_provider || 'gemini';
        document.getElementById('globalAiModel').value = s.global_ai_model || '';
        document.getElementById('globalAiKey').value = s.global_ai_api_key ? '********' : '';
        document.getElementById('globalAiUrl').value = s.global_ai_base_url || '';
        document.getElementById('aiLimitPerUser').value = s.ai_limit_per_user || 'unlimited';
    } catch(e) { console.error('Error loading config', e); }
}

async function saveSystemSettings(e) {
    e.preventDefault();
    const payload = {
        lockdown_mode: document.getElementById('lockdownToggle').classList.contains('active'),
        maintenance_mode: document.getElementById('maintenanceToggle').classList.contains('active'),
        signup_config: document.getElementById('signupConfig').value,
        domain_url: document.getElementById('domainUrl').value,
        footer_text: document.getElementById('footerText').value,
        global_ai_provider: document.getElementById('globalAiProvider').value,
        global_ai_model: document.getElementById('globalAiModel').value,
        global_ai_base_url: document.getElementById('globalAiUrl').value,
        ai_limit_per_user: document.getElementById('aiLimitPerUser').value
    };
    const key = document.getElementById('globalAiKey').value;
    if (key && key !== '********') payload.global_ai_api_key = key;

    try {
        await apiCall('/admin/system-settings', 'PUT', payload);
        alert('Settings saved!');
    } catch(err) { alert(err.message); }
}

// ========================
// RATE LIMITS
// ========================
async function loadRateLimits() {
    try {
        const s = await apiCall('/admin/rate-limits');
        
        // precise mapping
        document.getElementById('rlPerUser').value = s.per_user_api || 0;
        document.getElementById('rlGlobal').value = s.global_api || 0;
        document.getElementById('rlChat').value = s.chat_api || 0;
        document.getElementById('rlProcessing').value = s.processing_api || 0;
        document.getElementById('rlSessions').value = s.sessions || 0;
    } catch(e) {}
}

async function saveRateLimits(e) {
    e.preventDefault();
    try {
        await apiCall('/admin/rate-limits', 'PUT', {
            per_user_api: parseInt(document.getElementById('rlPerUser').value),
            global_api: parseInt(document.getElementById('rlGlobal').value),
            chat_api: parseInt(document.getElementById('rlChat').value),
            processing_api: parseInt(document.getElementById('rlProcessing').value),
            sessions: parseInt(document.getElementById('rlSessions').value),
        });
        alert('Rate limits saved');
    } catch(err) { alert(err.message); }
}

// ========================
// EMAIL CONFIG
// ========================
async function loadEmailConfig() {
    try {
        const s = await apiCall('/admin/email-config');
        document.getElementById('smtpProvider').value = s.smtp_provider || '';
        document.getElementById('emailAddress').value = s.email_address || '';
        document.getElementById('senderName').value = s.sender_name || '';
        document.getElementById('appPassword').value = s.app_password ? '********' : '';
    } catch(e) {}
}

async function saveEmailConfig(e) {
    e.preventDefault();
    const payload = {
        smtp_provider: document.getElementById('smtpProvider').value,
        email_address: document.getElementById('emailAddress').value,
        sender_name: document.getElementById('senderName').value,
    };
    const key = document.getElementById('appPassword').value;
    if (key && key !== '********') payload.app_password = key;

    try {
        await apiCall('/admin/email-config', 'PUT', payload);
        alert('Email Config saved');
    } catch(err) { alert(err.message); }
}

// ========================
// IP FILTERS
// ========================
async function loadIpFilters() {
    try {
        const filters = await apiCall('/admin/ip-filters');
        const tbody = document.querySelector('#ipFiltersTable tbody');
        tbody.innerHTML = '';
        if(filters.length === 0) return tbody.innerHTML = '<tr><td colspan="5">No filters found</td></tr>';

        filters.forEach(f => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${f.id}</td>
                <td>${f.filter_type}</td>
                <td>${f.rule_type}</td>
                <td>${f.value}</td>
                <td><button class="action-btn" style="color:red" onclick="deleteIpFilter('${f.id}')">Remove</button></td>
            `;
            tbody.appendChild(tr);
        });
    } catch(e) {}
}

async function addIpFilter(e) {
    e.preventDefault();
    try {
        await apiCall('/admin/ip-filters', 'POST', {
            filter_type: document.getElementById('ipFilterType').value,
            rule_type: document.getElementById('ipRuleType').value,
            value: document.getElementById('ipValue').value
        });
        document.getElementById('ipValue').value = '';
        loadIpFilters();
    } catch(err) { alert(err.message); }
}

async function deleteIpFilter(id) {
    if(!confirm('Delete filter?')) return;
    try {
        await apiCall(`/admin/ip-filters/${id}`, 'DELETE');
        loadIpFilters();
    } catch(e) { alert(e.message); }
}

// ========================
// SYSTEM LOGS
// ========================
async function loadLogs() {
    try {
        const action = document.getElementById('logActionFilter').value;
        const uid = document.getElementById('logUserIdFilter').value;
        let url = '/admin/logs?limit=50';
        if (action) url += `&action=${action}`;
        if (uid) url += `&user_id=${uid}`;

        const logs = await apiCall(url);
        const tbody = document.querySelector('#logsTable tbody');
        tbody.innerHTML = '';
        if(logs.length === 0) return tbody.innerHTML = '<tr><td colspan="6">No logs</td></tr>';

        logs.forEach(l => {
            const tr = document.createElement('tr');
            const d = new Date(l.timestamp).toLocaleString();
            tr.innerHTML = `
                <td>${d}</td>
                <td>${l.user_id || '-'}</td>
                <td><strong>${l.action}</strong></td>
                <td>${l.ip_address || '-'}</td>
                <td><small>${l.device_info || '-'}</small></td>
                <td>${l.details || '-'}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch(e) { alert(e.message); }
}
