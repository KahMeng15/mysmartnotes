/**
 * Global Progress Manager
 * Tracks background tasks and displays a floating progress card.
 */

const ProgressManager = {
    activeTasks: new Map(),
    isExpanded: false,
    autoHideTimeout: null,

    init: async function() {
        console.log('ProgressManager: Initializing...');
        // Create the progress card element
        this.createUI();
        
        // Fetch active tasks from backend
        await this.fetchActiveTasks();

        // Subscribe to WebSocket updates
        const setupWS = () => {
            if (window.WSManager) {
                console.log('ProgressManager: Subscribing to WS updates');
                window.WSManager.subscribe('*', (data) => this.handleTaskUpdate(data));
                return true;
            }
            return false;
        };

        if (!setupWS()) {
            console.warn('ProgressManager: WSManager not found, retrying...');
            let retries = 0;
            const interval = setInterval(() => {
                if (setupWS() || retries++ > 10) clearInterval(interval);
            }, 500);
        }

        // Periodically refresh active tasks to ensure consistency
        setInterval(() => this.fetchActiveTasks(), 30000);
    },

    createUI: function() {
        if (document.getElementById('globalProgressCard')) return;

        const card = document.createElement('div');
        card.id = 'globalProgressCard';
        card.className = 'global-progress-card';
        card.innerHTML = `
            <div class="global-progress-card-header" onclick="ProgressManager.toggleExpand()">
                <div class="global-progress-info">
                    <div class="global-progress-spinner"></div>
                    <span class="global-progress-title" id="progressGlobalTitle">Processing...</span>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span id="progressGlobalCounter" style="font-size: 11px; font-weight: 600; color: var(--color-gray);"></span>
                    <i class="ph ph-caret-up" id="progressToggleIcon"></i>
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
                    
                    data.tasks.forEach(task => {
                        const existing = this.activeTasks.get(task.task_id);
                        if (!existing || task.status !== existing.status || task.progress > existing.progress) {
                            this.activeTasks.set(task.task_id, task);
                        }
                    });

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

        // Auto-expand if a new task is added or if something starts processing
        if (!existing && !this.isExpanded) {
            this.toggleExpand();
        }

        this.activeTasks.set(data.task_id, task);

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
        if (!confirm('Are you sure you want to cancel this task?')) return;
        
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
                    this.renderTasks();
                }
            }
        } catch (e) {
            console.error('Error cancelling task:', e);
        }
    },

    renderTasks: function() {
        const content = document.getElementById('progressCardContent');
        const headerBar = document.getElementById('progressHeaderBar');
        const counter = document.getElementById('progressGlobalCounter');
        const globalTitle = document.getElementById('progressGlobalTitle');
        
        if (!content) return;

        const allTasks = Array.from(this.activeTasks.values());
        const activeTasks = allTasks.filter(t => !['completed', 'failed'].includes(t.status));
        const finishedTasks = allTasks.filter(t => ['completed', 'failed'].includes(t.status));

        // Sort: Active first, then by date
        const sortedTasks = [...activeTasks, ...finishedTasks].sort((a, b) => {
            const isAActive = !['completed', 'failed'].includes(a.status);
            const isBActive = !['completed', 'failed'].includes(b.status);
            if (isAActive && !isBActive) return -1;
            if (!isAActive && isBActive) return 1;
            return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
        });

        if (allTasks.length === 0) {
            content.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--color-gray); font-size: 12px;">No active tasks</div>';
            if (globalTitle) globalTitle.textContent = 'All tasks complete';
            if (headerBar) headerBar.style.width = '0%';
            if (counter) counter.textContent = '';
            return;
        }

        content.innerHTML = sortedTasks.map(task => {
            const name = this.getTaskName(task);
            const statusLabel = !['completed', 'failed'].includes(task.status) ? `${task.progress}%` : task.status;
            const isFinished = task.status === 'completed' || task.status === 'failed';
            
            return `
                <div class="task-item" id="task-${task.task_id}">
                    <div class="task-header">
                        <span class="task-name" title="${name}">${name}</span>
                        ${!isFinished ? `
                            <button class="task-cancel-btn" onclick="ProgressManager.cancelTask('${task.task_id}')">
                                <i class="ph ph-x"></i>
                            </button>
                        ` : ''}
                    </div>
                    <div class="task-progress-container">
                        <div class="task-progress-bar" style="width: ${task.progress}%; background-color: ${task.status === 'failed' ? 'var(--color-error)' : (task.status === 'completed' ? '#10b981' : 'var(--color-primary)')}"></div>
                    </div>
                    <span class="task-status-text">${statusLabel}${task.error ? ` - ${task.error}` : ''}</span>
                </div>
            `;
        }).join('');

        // Update Header
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
        if (task.input_data && task.input_data.kwargs) {
            const args = task.input_data.kwargs;
            if (args.title) return args.title;
            if (task.task_type === 'lecture_processing') return 'Note: ' + (args.lecture_id || 'Document');
            if (task.task_type === 'summary_generation') return 'Summary: ' + (args.lecture_id || 'Note');
            if (task.task_type === 'quiz_generation') return 'Quiz: ' + (args.title || 'Generation');
        }
        return task.task_id.startsWith('ocr_') ? 'Note Processing' : 'Background Task';
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
        } else if (!this.isExpanded) {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            setTimeout(() => {
                if (this.activeTasks.size === 0 && !this.isExpanded) {
                    card.style.display = 'none';
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
                this.activeTasks.clear();
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
