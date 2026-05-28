/**
 * Global Progress Manager
 * Tracks background tasks and displays a floating progress card.
 */

const ProgressManager = {
    activeTasks: new Map(),
    dismissedTasks: new Set(),
    isExpanded: false,
    autoHideTimeout: null,

    init: async function() {
        console.log('ProgressManager: Initializing...');
        
        // Load state from storage
        this.loadDismissedTasks();
        this.loadActiveTasks(); // Load cached tasks immediately
        this.isExpanded = localStorage.getItem('progressExpanded') === 'true';

        // Create the progress card element
        this.createUI();
        
        // If it was expanded, make sure UI reflects it
        if (this.isExpanded) {
            const card = document.getElementById('globalProgressCard');
            if (card) card.classList.add('expanded');
            const icon = document.getElementById('progressToggleIcon');
            if (icon) icon.className = 'ph ph-caret-down';
        }

        // Render immediately if we have cached tasks to avoid flickering
        if (this.activeTasks.size > 0) {
            this.renderTasks();
            this.updateVisibility();
        }
        
        // Fetch fresh active tasks from backend
        await this.fetchActiveTasks();

        // Subscribe to WebSocket updates
        const setupWS = () => {
            const manager = window.WSManager;
            if (manager) {
                console.log('ProgressManager: Subscribing to WS updates via window.WSManager');
                manager.subscribe('*', (data) => this.handleTaskUpdate(data));
                return true;
            }
            return false;
        };

        if (!setupWS()) {
            console.warn('ProgressManager: WSManager not found, retrying...');
            let retries = 0;
            const interval = setInterval(() => {
                if (setupWS() || retries++ > 20) {
                    if (retries > 20) console.error('ProgressManager: Failed to find WSManager after multiple retries.');
                    clearInterval(interval);
                }
            }, 500);
        }

        // Periodically refresh active tasks to ensure consistency
        setInterval(() => this.fetchActiveTasks(), 30000);
    },

    createUI: function() {
        if (document.getElementById('globalProgressCard')) return;

        const card = document.createElement('div');
        card.id = 'globalProgressCard';
        card.className = 'global-progress-card' + (this.isExpanded ? ' expanded' : '');
        card.innerHTML = `
            <div class="global-progress-card-header" onclick="ProgressManager.toggleExpand()">
                <div class="global-progress-info">
                    <i class="ph ph-activity" style="color: var(--color-primary); font-size: 18px;"></i>
                    <span class="global-progress-title" id="progressGlobalTitle">Processing...</span>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span id="progressGlobalCounter" style="font-size: 11px; font-weight: 600; color: var(--color-gray);"></span>
                    <i class="ph ${this.isExpanded ? 'ph-caret-down' : 'ph-caret-up'}" id="progressToggleIcon"></i>
                </div>
                <div class="global-progress-header-bar" id="progressHeaderBar" style="width: 0%"></div>
            </div>
            <div class="global-progress-card-content" id="progressCardContent">
                <!-- Task items injected here -->
            </div>
        `;
        document.body.appendChild(card);
    },

    toggleExpand: function() {
        this.isExpanded = !this.isExpanded;
        localStorage.setItem('progressExpanded', this.isExpanded);
        const card = document.getElementById('globalProgressCard');
        const icon = document.getElementById('progressToggleIcon');
        
        if (!card) return;
        
        if (this.isExpanded) {
            card.classList.add('expanded');
            if (icon) icon.className = 'ph ph-caret-down';
            if (this.autoHideTimeout) clearTimeout(this.autoHideTimeout);
        } else {
            card.classList.remove('expanded');
            if (icon) icon.className = 'ph ph-caret-up';
            this.checkAndScheduleAutoHide();
        }
    },

    fetchActiveTasks: async function() {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const response = await fetch('/search/tasks/active', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const contentType = response.headers.get("content-type");
                if (contentType && contentType.indexOf("application/json") !== -1) {
                    const data = await response.json();
                    console.log('ProgressManager: Fetched active tasks', data.tasks.length);
                    
                    // Clear and rebuild to sync with server
                    // Only keep tasks that are NOT in dismissedTasks
                    const syncedTasks = new Map();
                    data.tasks.forEach(task => {
                        if (!this.dismissedTasks.has(task.task_id)) {
                            syncedTasks.set(task.task_id, task);
                        }
                    });
                    
                    this.activeTasks = syncedTasks;
                    this.saveActiveTasks();

                    // Auto-expand on load if there are active tasks AND it was previously expanded OR never set
                    if (this.activeTasks.size > 0 && localStorage.getItem('progressExpanded') === null) {
                        this.isExpanded = true;
                        localStorage.setItem('progressExpanded', 'true');
                    }

                    this.renderTasks();
                    this.updateVisibility();
                }
            }
        } catch (e) {
            console.error('ProgressManager: Error fetching active tasks', e);
        }
    },

    handleTaskUpdate: function(data) {
        if (!data || !data.task_id) return;
        
        // Don't show updates for tasks the user explicitly dismissed
        if (this.dismissedTasks.has(data.task_id)) return;

        console.log('ProgressManager: Received task update', data.task_id, data.status, data.progress + '%');

        const existing = this.activeTasks.get(data.task_id);
        const task = existing || { 
            task_id: data.task_id,
            task_type: data.task_type || 'unknown',
            status: data.status,
            progress: 0
        };

        const wasFinished = task.status === 'completed' || task.status === 'failed';
        
        task.status = data.status;
        task.progress = data.progress;
        if (data.error) task.error = data.error;
        if (data.task_type) task.task_type = data.task_type;
        if (data.input_data) task.input_data = data.input_data;
        if (data.message) task.message = data.message;

        // Auto-expand if a new task is added or if something starts processing, 
        // BUT ONLY IF the user hasn't explicitly collapsed it (stay persistent)
        if (!existing && !this.isExpanded && localStorage.getItem('progressExpanded') !== 'false') {
            this.toggleExpand();
        }

        this.activeTasks.set(data.task_id, task);
        this.saveActiveTasks();

        this.renderTasks();
        this.updateVisibility();
        
        // If finished, schedule auto-hide check
        if ((task.status === 'completed' || task.status === 'failed') && !wasFinished) {
            this.checkAndScheduleAutoHide();
        }

        // Custom events for dashboards to listen to
        window.dispatchEvent(new CustomEvent('taskUpdate', { detail: data }));
    },

    cancelTask: async function(taskId) {
        const confirmFn = window.showConfirmModal || ((msg, cb) => { if(window.confirm(msg)) cb(); });
        
        confirmFn('Are you sure you want to cancel this task?', async () => {
            try {
                const token = localStorage.getItem('token');
                const response = await fetch(`/search/tasks/${taskId}/cancel`, { 
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const task = this.activeTasks.get(taskId);
                    if (task) {
                        task.status = 'failed';
                        task.error = 'Cancelled';
                        this.dismissTask(taskId); // Auto-dismiss cancelled tasks to keep UI clean
                    }
                }
            } catch (e) {
                console.error('Error cancelling task:', e);
            }
        });
    },

    renderTasks: function() {
        const content = document.getElementById('progressCardContent');
        const headerBar = document.getElementById('progressHeaderBar');
        const counter = document.getElementById('progressGlobalCounter');
        const globalTitle = document.getElementById('progressGlobalTitle');
        
        if (!content) return;

        const allTasks = Array.from(this.activeTasks.values());

        if (allTasks.length === 0) {
            content.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--color-gray); font-size: 12px;">No active tasks</div>';
            if (globalTitle) globalTitle.textContent = 'All tasks complete';
            if (headerBar) headerBar.style.width = '0%';
            if (counter) counter.textContent = '';
            return;
        }

        content.innerHTML = allTasks.map(task => {
            const name = this.getTaskName(task);
            const isFinished = task.status === 'completed' || task.status === 'failed';
            // Use message if available (e.g. "Completed"), otherwise fallback to % or status
            const statusLabel = task.message || (isFinished ? (task.status === 'completed' ? 'Completed' : 'failed') : `${task.progress}%`);
            const url = this.getTaskUrl(task);
            
            return `
                <div class="task-item" id="task-${task.task_id}">
                    <div class="task-header">
                        <a href="${url || '#'}" class="task-name" title="${name}" style="text-decoration: none; color: inherit; cursor: ${url ? 'pointer' : 'default'};">
                            ${name}
                        </a>
                        ${!isFinished ? `
                            <button class="task-cancel-btn" onclick="ProgressManager.cancelTask('${task.task_id}')" title="Cancel task">
                                <i class="ph ph-x"></i>
                            </button>
                        ` : `
                            <button class="task-cancel-btn" onclick="ProgressManager.dismissTask('${task.task_id}')" title="Clear from list">
                                <i class="ph ph-x"></i>
                            </button>
                        `}
                    </div>
                    <div class="task-progress-container">
                        <div class="task-progress-bar" style="width: ${task.progress}%; background-color: ${task.status === 'failed' ? 'var(--color-error)' : (task.status === 'completed' ? '#10b981' : 'var(--color-primary)')}"></div>
                    </div>
                    <span class="task-status-text">${statusLabel}${task.error ? ` - ${task.error}` : ''}</span>
                </div>
            `;
        }).join('');

        // Update Header
        const activeTasks = allTasks.filter(t => !['completed', 'failed'].includes(t.status));
        const finishedTasks = allTasks.filter(t => ['completed', 'failed'].includes(t.status));
        const totalCount = allTasks.length;
        const completeCount = finishedTasks.filter(t => t.status === 'completed').length;
        
        if (activeTasks.length > 0) {
            const avgProgress = activeTasks.reduce((acc, t) => acc + t.progress, 0) / activeTasks.length;
            if (headerBar) headerBar.style.width = avgProgress + '%';
            if (counter) counter.textContent = `${completeCount}/${totalCount}`;
            if (globalTitle) globalTitle.textContent = `${activeTasks.length} task${activeTasks.length > 1 ? 's' : ''} processing...`;
        } else {
            const failedCount = finishedTasks.filter(t => t.status === 'failed').length;
            if (headerBar) headerBar.style.width = '100%';
            if (counter) counter.textContent = `${completeCount}/${totalCount}`;
            
            if (failedCount > 0) {
                if (globalTitle) globalTitle.textContent = `${failedCount} task${failedCount > 1 ? 's' : ''} failed`;
                if (headerBar) headerBar.style.backgroundColor = 'var(--color-error)';
            } else {
                if (globalTitle) globalTitle.textContent = 'Processing complete';
                if (headerBar) headerBar.style.backgroundColor = '#10b981';
            }
        }
    },

    getTaskName: function(task) {
        const kwargs = task.input_data?.kwargs || {};
        if (kwargs.file_name) return kwargs.file_name;
        if (kwargs.title) return kwargs.title;
        
        if (task.task_type === 'lecture_processing') return 'Note: ' + (kwargs.lecture_id || 'Document');
        if (task.task_type === 'summary_generation') return 'Summary: ' + (kwargs.lecture_id || 'Note');
        if (task.task_type === 'quiz_generation') return 'Quiz: ' + (kwargs.title || 'Generation');
        
        return task.task_id.startsWith('ocr_') ? 'Note Processing' : 'Background Task';
    },

    getTaskUrl: function(task) {
        const kwargs = task.input_data?.kwargs || {};
        if (task.task_type === 'lecture_processing' && kwargs.lecture_id) {
            return `/note.html?id=${kwargs.lecture_id}`;
        }
        if (task.task_type === 'summary_generation' && kwargs.lecture_id) {
            return `/note/${kwargs.lecture_id}/summary`;
        }
        if (task.task_type === 'quiz_generation') {
            return `/quiz_dashboard.html`;
        }
        return null;
    },

    dismissTask: function(taskId) {
        this.activeTasks.delete(taskId);
        this.saveActiveTasks();
        this.dismissedTasks.add(taskId);
        this.saveDismissedTasks(); // Persist to storage
        this.renderTasks();
        this.updateVisibility();
    },

    loadActiveTasks: function() {
        try {
            const stored = localStorage.getItem('progress_active_tasks');
            if (stored) {
                const tasks = JSON.parse(stored);
                this.activeTasks = new Map(tasks.map(t => [t.task_id, t]));
            }
        } catch (e) {
            console.error('Error loading active tasks:', e);
            this.activeTasks = new Map();
        }
    },

    saveActiveTasks: function() {
        try {
            const tasks = Array.from(this.activeTasks.values());
            localStorage.setItem('progress_active_tasks', JSON.stringify(tasks));
        } catch (e) {
            console.error('Error saving active tasks:', e);
        }
    },

    loadDismissedTasks: function() {
        try {
            const stored = localStorage.getItem('progress_dismissed_tasks');
            if (stored) {
                const data = JSON.parse(stored);
                // Data format: { taskId: timestamp }
                const now = Date.now();
                const oneDay = 24 * 60 * 60 * 1000;
                
                this.dismissedTasks = new Set();
                for (const [id, time] of Object.entries(data)) {
                    // Only keep for 24 hours to keep localStorage clean
                    if (now - time < oneDay) {
                        this.dismissedTasks.add(id);
                    }
                }
            }
        } catch (e) {
            console.error('Error loading dismissed tasks:', e);
            this.dismissedTasks = new Set();
        }
    },

    saveDismissedTasks: function() {
        try {
            const data = {};
            const now = Date.now();
            this.dismissedTasks.forEach(id => {
                data[id] = now;
            });
            localStorage.setItem('progress_dismissed_tasks', JSON.stringify(data));
        } catch (e) {
            console.error('Error saving dismissed tasks:', e);
        }
    },

    updateVisibility: function() {
        const card = document.getElementById('globalProgressCard');
        if (!card) return;
        
        if (this.activeTasks.size > 0) {
            card.style.display = 'block';
            // Trigger reflow for transition
            card.offsetHeight;
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        } else {
            // Hide if no tasks, even if it was expanded
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            setTimeout(() => {
                if (this.activeTasks.size === 0) {
                    card.style.display = 'none';
                    this.isExpanded = false;
                    card.classList.remove('expanded');
                }
            }, 400);
        }
    },

    checkAndScheduleAutoHide: function() {
        if (this.autoHideTimeout) clearTimeout(this.autoHideTimeout);
        
        const activeCount = Array.from(this.activeTasks.values()).filter(t => !['completed', 'failed'].includes(t.status)).length;
        
        if (activeCount === 0 && !this.isExpanded) {
            this.autoHideTimeout = setTimeout(() => {
                // Clear finished tasks and hide
                const allFinished = Array.from(this.activeTasks.keys());
                allFinished.forEach(id => {
                    this.activeTasks.delete(id);
                    this.dismissedTasks.add(id);
                });
                this.saveActiveTasks();
                this.saveDismissedTasks(); // Persist auto-cleared ones
                this.updateVisibility();
                this.renderTasks();
            }, 10000); // Wait 10 seconds after all done before clearing
        }
    }
};

// Initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ProgressManager.init());
} else {
    ProgressManager.init();
}
