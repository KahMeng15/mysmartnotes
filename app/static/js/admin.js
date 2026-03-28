const API_URL = '';
const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || '{}');
let inviteMethod = 'email';

window.addEventListener('load', () => {
    if (!token || !user.is_admin) {
        alert('Unauthorized access');
        window.location.href = 'dashboard.html';
        return;
    }
    setInviteMethod('email');
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
    if (tabId === 'tab-tiers') loadTiers();
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
                <td><span class="badge ${u.tier === 'pro' ? 'pro' : u.tier === 'unlimited' ? 'unlimited' : 'free'}">${u.tier}</span></td>
                <td>
                    ${u.is_active ? '<span style="color:green">Active</span>' : '<span style="color:red">Inactive</span>'}
                    <br>
                    ${u.is_admin ? '<span style="color:purple;font-size:12px">Admin</span>' : ''}
                </td>
                <td>
                    <button class="action-btn" onclick="openTierModal(${u.id}, '${u.email}', '${u.tier}')">Change Tier</button>
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

function openTierModal(userId, email, currentTier) {
    document.getElementById('changeTierModal').style.display = 'flex';
    document.getElementById('changeTierUserEmail').value = email;
    document.getElementById('changeTierSelect').value = currentTier;
    document.getElementById('changeTierSelect').dataset.userId = userId;
}

function closeTierModal() {
    document.getElementById('changeTierModal').style.display = 'none';
}

async function submitTierChange(e) {
    e.preventDefault();
    const userId = parseInt(document.getElementById('changeTierSelect').dataset.userId);
    const newTier = document.getElementById('changeTierSelect').value;
    
    if (!newTier) {
        alert('Please select a tier');
        return;
    }
    
    try {
        await apiCall('/admin/users/action', 'POST', { user_id: userId, action: 'tier', value: newTier });
        alert('User tier updated successfully');
        closeTierModal();
        loadUsers();
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

// ========================
// INVITATIONS
// ========================
function openInviteModal() {
    document.getElementById('inviteModal').style.display = 'flex';
    const emailRadio = document.querySelector('input[name="inviteMethod"][value="email"]');
    if (emailRadio) emailRadio.checked = true;
    setInviteMethod('email');
}

function closeInviteModal() {
    document.getElementById('inviteModal').style.display = 'none';
}

function setInviteMethod(mode) {
    inviteMethod = mode;
    const emailInput = document.getElementById('inviteEmail');
    const emailGroup = document.getElementById('inviteEmailGroup');
    const helpText = document.getElementById('inviteMethodHelp');
    if (!emailInput || !emailGroup) return;
    if (mode === 'email') {
        emailInput.disabled = false;
        emailInput.required = true;
        emailGroup.style.opacity = '1';
        if (helpText) helpText.textContent = 'Invitations sent via email will notify users automatically.';
    } else {
        emailInput.disabled = true;
        emailInput.required = false;
        emailGroup.style.opacity = '0.6';
        if (helpText) helpText.textContent = 'Shareable links can be distributed without entering an email address.';
    }
}

async function sendInvite(e) {
    e.preventDefault();
    const emailInput = document.getElementById('inviteEmail');
    const email = emailInput.value.trim();
    const tier = document.getElementById('inviteTier').value;
    const sendEmail = inviteMethod === 'email';
    
    try {
        if (sendEmail && !email) {
            alert('Please enter an email address to send the invitation.');
            return;
        }

        const payload = { tier, send_email: sendEmail };
        if (sendEmail) payload.email = email;

        const res = await apiCall('/admin/invitations', 'POST', payload);
        const message = sendEmail
            ? `Invitation link created and sent to ${email}`
            : 'Shareable invitation link created';
        alert(`${message}:\n\n${res.invitation_link}`);
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
            tbody.innerHTML = '<tr><td colspan="7">No pending invitations</td></tr>';
            return;
        }
        
        invites.forEach(i => {
            const tr = document.createElement('tr');
            const expires = new Date(i.expires_at).toLocaleString();
            const emailDisplay = i.send_email ? i.email : '<span style="color:var(--color-gray)">Shareable link</span>';
            const methodLabel = i.send_email
                ? '<span style="color:#0f9d58; font-weight:600;">Email</span>'
                : '<span style="color:#f59e0b; font-weight:600;">Link only</span>';
            tr.innerHTML = `
                <td>${emailDisplay}</td>
                <td>${methodLabel}</td>
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
        
        // Session Management
        document.getElementById('sessionLength').value = s.session_length || 24;
        document.getElementById('sessionUnit').value = s.session_unit || 'hours';
        if (s.session_reset_on_activity) document.getElementById('sessionResetToggle').classList.add('active');
        else document.getElementById('sessionResetToggle').classList.remove('active');

        // Quiz Config
        document.getElementById('maxQuizQuestions').value = s.max_quiz_questions || 500;

        // Unnecessary Logins
        if (s.unnecessary_logins_enabled) document.getElementById('unnecessaryLoginsToggle').classList.add('active');
        else document.getElementById('unnecessaryLoginsToggle').classList.remove('active');
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
        ai_limit_per_user: document.getElementById('aiLimitPerUser').value,
        session_length: parseInt(document.getElementById('sessionLength').value),
        session_unit: document.getElementById('sessionUnit').value,
        session_reset_on_activity: document.getElementById('sessionResetToggle').classList.contains('active'),
        max_quiz_questions: parseInt(document.getElementById('maxQuizQuestions').value),
        unnecessary_logins_enabled: document.getElementById('unnecessaryLoginsToggle').classList.contains('active')
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

async function sendTestEmail(e) {
    e.preventDefault();
    const testEmail = document.getElementById('testEmailAddress').value.trim();
    const msgBox = document.getElementById('testEmailMsg');
    
    if (!testEmail) {
        msgBox.className = 'message-box error';
        msgBox.textContent = 'Please enter an email address.';
        msgBox.style.display = 'block';
        return;
    }
    
    msgBox.style.display = 'none';
    
    try {
        const result = await apiCall('/admin/email-config/test', 'POST', { test_email: testEmail });
        msgBox.className = 'message-box success';
        msgBox.textContent = result.message || 'Test email sent successfully!';
        msgBox.style.display = 'block';
        document.getElementById('testEmailAddress').value = '';
    } catch(err) {
        msgBox.className = 'message-box error';
        msgBox.textContent = err.message || 'Failed to send test email.';
        msgBox.style.display = 'block';
    }
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

// ========================
// TIER CONFIGURATION
// ========================
async function loadTiers() {
    try {
        const tiers = await apiCall('/admin/tiers');
        
        // Populate tier forms with data
        const tierMap = {};
        tiers.forEach(t => {
            tierMap[t.id] = t;
        });
        
        // Populate Unlimited Tier
        if (tierMap.unlimited) {
            const t = tierMap.unlimited;
            document.getElementById('tierMaxNotesUnlimited').value = t.max_notes;
            document.getElementById('tierMaxSubjectsUnlimited').value = t.max_subjects;
            document.getElementById('tierMaxGroupsUnlimited').value = t.max_groups;
            document.getElementById('tierMaxConversationsUnlimited').value = t.max_conversations;
            document.getElementById('tierMaxMessagesUnlimited').value = t.max_messages;
            document.getElementById('tierMaxStorageUnlimited').value = t.max_storage_gb;
            document.getElementById('tierMaxQuizzesUnlimited').value = t.max_quizzes;
            document.getElementById('tierMaxSummariesUnlimited').value = t.max_summaries;
            document.getElementById('tierConversationsResetUnlimited').value = t.conversations_reset_period || '';
            document.getElementById('tierMessagesResetUnlimited').value = t.messages_reset_period || '';
            document.getElementById('tierSummariesResetUnlimited').value = t.summaries_reset_period || '';
        }
        
        // Populate Free Tier
        if (tierMap.free) {
            const t = tierMap.free;
            document.getElementById('tierMaxNotesFree').value = t.max_notes;
            document.getElementById('tierMaxSubjectsFree').value = t.max_subjects;
            document.getElementById('tierMaxGroupsFree').value = t.max_groups;
            document.getElementById('tierMaxConversationsFree').value = t.max_conversations;
            document.getElementById('tierMaxMessagesFree').value = t.max_messages;
            document.getElementById('tierMaxStorageFree').value = t.max_storage_gb;
            document.getElementById('tierMaxQuizzesFree').value = t.max_quizzes;
            document.getElementById('tierMaxSummariesFree').value = t.max_summaries;
            document.getElementById('tierConversationsResetFree').value = t.conversations_reset_period || '';
            document.getElementById('tierMessagesResetFree').value = t.messages_reset_period || '';
            document.getElementById('tierSummariesResetFree').value = t.summaries_reset_period || '';
        }
        
        // Populate Pro Tier
        if (tierMap.pro) {
            const t = tierMap.pro;
            document.getElementById('tierMaxNotesPro').value = t.max_notes;
            document.getElementById('tierMaxSubjectsPro').value = t.max_subjects;
            document.getElementById('tierMaxGroupsPro').value = t.max_groups;
            document.getElementById('tierMaxConversationsPro').value = t.max_conversations;
            document.getElementById('tierMaxMessagesPro').value = t.max_messages;
            document.getElementById('tierMaxStoragePro').value = t.max_storage_gb;
            document.getElementById('tierMaxQuizzesPro').value = t.max_quizzes;
            document.getElementById('tierMaxSummariesPro').value = t.max_summaries;
            document.getElementById('tierConversationsResetPro').value = t.conversations_reset_period || '';
            document.getElementById('tierMessagesResetPro').value = t.messages_reset_period || '';
            document.getElementById('tierSummariesResetPro').value = t.summaries_reset_period || '';
        }
        
        // Populate Early Testers Tier
        if (tierMap.early_tester) {
            const t = tierMap.early_tester;
            document.getElementById('tierMaxNotesEarlyTester').value = t.max_notes;
            document.getElementById('tierMaxSubjectsEarlyTester').value = t.max_subjects;
            document.getElementById('tierMaxGroupsEarlyTester').value = t.max_groups;
            document.getElementById('tierMaxConversationsEarlyTester').value = t.max_conversations;
            document.getElementById('tierMaxMessagesEarlyTester').value = t.max_messages;
            document.getElementById('tierMaxStorageEarlyTester').value = t.max_storage_gb;
            document.getElementById('tierMaxQuizzesEarlyTester').value = t.max_quizzes;
            document.getElementById('tierMaxSummariesEarlyTester').value = t.max_summaries;
            document.getElementById('tierConversationsResetEarlyTester').value = t.conversations_reset_period || '';
            document.getElementById('tierMessagesResetEarlyTester').value = t.messages_reset_period || '';
            document.getElementById('tierSummariesResetEarlyTester').value = t.summaries_reset_period || '';
        }
        
        // Update invite modal dropdown
        const inviteTierSelect = document.getElementById('inviteTier');
        if (inviteTierSelect) {
            inviteTierSelect.innerHTML = '';
            tiers.forEach(tier => {
                const opt = document.createElement('option');
                opt.value = tier.id;
                opt.textContent = tier.display_name;
                inviteTierSelect.appendChild(opt);
            });
        }
    } catch (e) { console.error('Error loading tiers:', e); }
}

async function saveTierConfig(e, tierId) {
    e.preventDefault();
    
    const fieldSuffix = tierId === 'early_tester' ? 'EarlyTester' : (tierId.charAt(0).toUpperCase() + tierId.slice(1));
    
    const tierData = {
        id: tierId,
        display_name: tierId === 'early_tester' ? 'Early Tester' : (tierId.charAt(0).toUpperCase() + tierId.slice(1)),
        max_notes: parseInt(document.getElementById(`tierMaxNotes${fieldSuffix}`).value),
        max_subjects: parseInt(document.getElementById(`tierMaxSubjects${fieldSuffix}`).value),
        max_groups: parseInt(document.getElementById(`tierMaxGroups${fieldSuffix}`).value),
        max_conversations: parseInt(document.getElementById(`tierMaxConversations${fieldSuffix}`).value),
        max_messages: parseInt(document.getElementById(`tierMaxMessages${fieldSuffix}`).value),
        max_storage_gb: parseInt(document.getElementById(`tierMaxStorage${fieldSuffix}`).value),
        max_quizzes: parseInt(document.getElementById(`tierMaxQuizzes${fieldSuffix}`).value),
        max_summaries: parseInt(document.getElementById(`tierMaxSummaries${fieldSuffix}`).value),
        conversations_reset_period: document.getElementById(`tierConversationsReset${fieldSuffix}`).value || null,
        messages_reset_period: document.getElementById(`tierMessagesReset${fieldSuffix}`).value || null,
        summaries_reset_period: document.getElementById(`tierSummariesReset${fieldSuffix}`).value || null
    };
    
    try {
        await apiCall(`/admin/tiers/${tierId}`, 'PUT', tierData);
        alert(`${tierId === 'early_tester' ? 'Early Testers' : (tierId.charAt(0).toUpperCase() + tierId.slice(1))} tier updated successfully!`);
        loadTiers();
    } catch (err) {
        alert('Error updating tier: ' + err.message);
    }
}
