/**
 * ─── WebSocket Management ──────────────────────────────────────────
 */
const WSManager = {
    socket: null,
    listeners: new Map(),
    reconnectInterval: 5000,
    maxRetries: 5,
    retries: 0,

    init: function() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) return;
        
        const token = this._getCookie('access_token');
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let wsUrl;

        if (token) {
            wsUrl = `${protocol}//${window.location.host}/ws/${token}`;
        } else {
            // Fallback to cookie-based auth on the server side
            wsUrl = `${protocol}//${window.location.host}/ws/updates`;
            console.log('WSManager: No access token in JS, attempting cookie-based connection');
        }
        
        console.log('WSManager: Connecting to', wsUrl);
        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
            console.log('WSManager: WebSocket connected');
            this.retries = 0;
        };

        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('WSManager: Received message', data);
                this._emit(data.task_id, data);
            } catch (e) {
                console.error('WSManager: Error parsing message', e);
            }
        };

        this.socket.onclose = () => {
            console.log('WSManager: WebSocket disconnected');
            this._reconnect();
        };

        this.socket.onerror = (error) => {
            console.error('WSManager: WebSocket error', error);
        };
    },

    _reconnect: function() {
        if (this.retries < this.maxRetries) {
            this.retries++;
            setTimeout(() => this.init(), this.reconnectInterval);
        }
    },

    _getCookie: function(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    },

    subscribe: function(taskId, callback) {
        if (!this.listeners.has(taskId)) {
            this.listeners.set(taskId, []);
        }
        this.listeners.get(taskId).push(callback);
    },

    unsubscribe: function(taskId) {
        this.listeners.delete(taskId);
    },

    _emit: function(taskId, data) {
        // Handle wildcard listeners
        if (this.listeners.has('*')) {
            this.listeners.get('*').forEach(callback => callback(data));
        }

        if (this.listeners.has(taskId)) {
            this.listeners.get(taskId).forEach(callback => callback(data));
        }
    }
};

// Initialize WebSocket on page load if logged in
document.addEventListener('DOMContentLoaded', () => {
    // Check for any sign of a session since access_token is HttpOnly
    if (WSManager._getCookie('csrf_token') || localStorage.getItem('user')) {
        WSManager.init();
    }
});

/**
 * ─── TOAST NOTIFICATION SYSTEM ─────────────────────────────────────
 * Modern, non-blocking notifications to replace browser alert()
 */

// Initialize toast container
function initToastContainer() {
    if (!document.getElementById('toast-container')) {
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('aria-atomic', 'true');
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: none;
        `;
        document.body.appendChild(container);
    }
}

/**
 * Show a toast notification
 * @param {string} type - 'success', 'error', 'info', 'warning'
 * @param {string} message - Toast message
 * @param {number} duration - Auto-dismiss duration in ms (0 = no auto-dismiss)
 */
function showToast(type = 'info', message = '', duration = 4000) {
    initToastContainer();
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const typeClass = `toast-${type}`;
    
    toast.className = `toast ${typeClass}`;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'assertive');
    toast.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); background: var(--toast-${type}-bg, #fff); color: var(--toast-${type}-text, #000); max-width: 400px; word-wrap: break-word;">
            <span>${message}</span>
            <button class="toast-close" onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; font-size: 18px; cursor: pointer; color: inherit; padding: 0; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;" aria-label="Close notification">×</button>
        </div>
    `;
    
    container.appendChild(toast);
    
    if (duration > 0) {
        setTimeout(() => toast.remove(), duration);
    }
    
    return toast;
}

/**
 * ─── UTILITY FUNCTIONS ─────────────────────────────────────────────
 */

/**
 * Generates a UUID v4 string
 * @returns {string} UUID in format xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0,
            v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * AI Explanation Mode Metadata (centralized)
 */
const MODE_META = {
    normal: { label: 'Normal', description: 'Learn the concept, step-by-step, in your current language' },
    concise: { label: 'Concise', description: 'Quick summary, key points only' },
    socratic: { label: 'Socratic', description: 'Guided questions to help you discover the answer' },
    creative: { label: 'Creative', description: 'Real-world examples, analogies, stories' },
    game: { label: 'Game', description: 'Learning through interactive challenges and quizzes' }
};

const OUTPUT_FORMAT_META = {
    sentence: { label: 'Sentences', description: 'Short, readable paragraphs' },
    bullet: { label: 'Bullet Points', description: 'Key takeaways, quick reference format' },
    table: { label: 'Table', description: 'Structured comparison or breakdown' },
    code: { label: 'Code', description: 'Programming examples and snippets' }
};

/**
 * Safe localStorage wrapper - handles quota exceeded and private mode
 */
const SafeStorage = {
    set: function(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            if (error.name === 'QuotaExceededError') {
                console.warn('Storage quota exceeded');
                return false;
            }
            if (error.name === 'SecurityError') {
                console.warn('Cannot access storage in private mode');
                return false;
            }
            console.error('Storage error:', error);
            return false;
        }
    },
    
    get: function(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.warn('Error reading from storage:', error);
            return defaultValue;
        }
    },
    
    remove: function(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('Error removing from storage:', error);
            return false;
        }
    }
};

/**
 * Generates a contrasting color for a new subject based on existing colors.
 * @param {string[]} existingColors - Array of hex color strings (e.g., ['#ff0000', '#00ff00'])
 * @returns {string} - Hex color string (e.g., '#0000ff')
 */
function generateContrastingColor(existingColors) {
    if (!existingColors || existingColors.length === 0) {
        return '#3b82f6'; // Default Blue
    }

    // Convert hex to HSL to work with hue
    const hues = existingColors.map(hex => hexToHSL(hex).h);

    // Simple strategy: Find the largest gap between existing hues and pick the middle
    hues.sort((a, b) => a - b);

    let maxGap = 0;
    let bestHue = 0;

    // Check gaps between sorted hues
    for (let i = 0; i < hues.length - 1; i++) {
        const gap = hues[i + 1] - hues[i];
        if (gap > maxGap) {
            maxGap = gap;
            bestHue = hues[i] + gap / 2;
        }
    }

    // Check gap between last and first (wrapping around 360)
    const wrapGap = (360 - hues[hues.length - 1]) + hues[0];
    if (wrapGap > maxGap) {
        maxGap = wrapGap;
        bestHue = (hues[hues.length - 1] + wrapGap / 2) % 360;
    }

    // Return hex with fixed Saturation and Lightness for consistency
    return hslToHex(bestHue, 70, 50);
}

// Helper: Hex to HSL
function hexToHSL(H) {
    // Convert hex to RGB first
    let r = 0, g = 0, b = 0;
    if (H.length == 4) {
        r = "0x" + H[1] + H[1];
        g = "0x" + H[2] + H[2];
        b = "0x" + H[3] + H[3];
    } else if (H.length == 7) {
        r = "0x" + H[1] + H[2];
        g = "0x" + H[3] + H[4];
        b = "0x" + H[5] + H[6];
    }
    // Then to HSL
    r /= 255;
    g /= 255;
    b /= 255;
    let cmin = Math.min(r, g, b),
        cmax = Math.max(r, g, b),
        delta = cmax - cmin,
        h = 0,
        s = 0,
        l = 0;

    if (delta == 0)
        h = 0;
    else if (cmax == r)
        h = ((g - b) / delta) % 6;
    else if (cmax == g)
        h = (b - r) / delta + 2;
    else
        h = (r - g) / delta + 4;

    h = Math.round(h * 60);

    if (h < 0)
        h += 360;

    l = (cmax + cmin) / 2;
    s = delta == 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
    s = +(s * 100).toFixed(1);
    l = +(l * 100).toFixed(1);

    return { h, s, l };
}

// Helper: HSL to Hex
function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;

    let c = (1 - Math.abs(2 * l - 1)) * s,
        x = c * (1 - Math.abs((h / 60) % 2 - 1)),
        m = l - c / 2,
        r = 0,
        g = 0,
        b = 0;

    if (0 <= h && h < 60) {
        r = c; g = x; b = 0;
    } else if (60 <= h && h < 120) {
        r = x; g = c; b = 0;
    } else if (120 <= h && h < 180) {
        r = 0; g = c; b = x;
    } else if (180 <= h && h < 240) {
        r = 0; g = x; b = c;
    } else if (240 <= h && h < 300) {
        r = x; g = 0; b = c;
    } else if (300 <= h && h < 360) {
        r = c; g = 0; b = x;
    }

    r = Math.round((r + m) * 255).toString(16);
    g = Math.round((g + m) * 255).toString(16);
    b = Math.round((b + m) * 255).toString(16);

    if (r.length == 1)
        r = "0" + r;
    if (g.length == 1)
        g = "0" + g;
    if (b.length == 1)
        b = "0" + b;

    return "#" + r + g + b;
}

/**
 * ─── Global AI Settings Management ───────────────────────────────────
 * Shared utility functions for persisting AI explanation settings
 * across all pages (quiz, summary, chat)
 */

/**
 * Load AI explanation settings from localStorage
 * @returns {Object} Settings object with scope, mode, output properties
 */
function loadAiExplainSettings() {
    try {
        const stored = localStorage.getItem('aiExplainSettings');
        if (stored) {
            const settings = JSON.parse(stored);
            return {
                scope: settings.scope || 'source',
                mode: settings.mode || 'normal',
                output: settings.output || 'sentence'
            };
        }
    } catch (error) {
        console.warn('Failed to load AI explain settings:', error);
    }
    return { scope: 'source', mode: 'normal', output: 'sentence' };
}

/**
 * Save AI explanation settings to localStorage
 * @param {Object} settings - Object with scope, mode, output properties
 */
function saveAiExplainSettings(settings) {
    try {
        localStorage.setItem('aiExplainSettings', JSON.stringify({
            scope: settings.scope,
            mode: settings.mode,
            output: settings.output
        }));
    } catch (error) {
        console.warn('Failed to save AI explain settings:', error);
    }
}

/**
 * ─── MODAL SYSTEM ─────────────────────────────────────────────
 */

window.showSuccessModal = function (title, message, callback) {
    // Create success modal if it doesn't exist
    let successModal = document.getElementById('successModal');
    if (!successModal) {
        successModal = document.createElement('div');
        successModal.id = 'successModal';
        successModal.className = 'modal';
        document.body.appendChild(successModal);
    }

    // Update content
    successModal.innerHTML = `
        <div class="modal-content text-center" style="min-height: auto;">
            <div class="modal-icon success">
                <i class="ph ph-check-circle"></i>
            </div>
            <h3>${title || 'Success!'}</h3>
            <p style="color: var(--color-gray); margin-bottom: var(--spacing-lg);">${message || 'Operation completed successfully.'}</p>
            <div class="modal-buttons">
                <button type="button" class="btn-save" id="successModalDoneBtn">Done</button>
            </div>
        </div>
    `;

    const doneBtn = document.getElementById('successModalDoneBtn');
    doneBtn.onclick = function() {
        closeSuccessModal();
        if (typeof callback === 'function') {
            callback();
        }
    };

    // Show the modal
    successModal.classList.add('active');
};

window.closeSuccessModal = function () {
    const successModal = document.getElementById('successModal');
    if (successModal) {
        successModal.classList.remove('active');
    }
};

window.showErrorModal = function (title, message, extraHtml = '') {
    // Create error modal if it doesn't exist
    let errorModal = document.getElementById('errorModal');
    if (!errorModal) {
        errorModal = document.createElement('div');
        errorModal.id = 'errorModal';
        errorModal.className = 'modal';
        document.body.appendChild(errorModal);
    }

    // Update content
    errorModal.innerHTML = `
        <div class="modal-content text-center" style="min-height: auto;">
            <div class="modal-icon error" style="color: var(--color-error); font-size: 48px; margin-bottom: 16px;">
                <i class="ph ph-x-circle"></i>
            </div>
            <h3>${title || 'Error'}</h3>
            <p style="color: var(--color-gray); margin-bottom: var(--spacing-lg);">${message || 'An unexpected error occurred.'}</p>
            ${extraHtml ? `<div class="extra-modal-content" style="margin-bottom: var(--spacing-lg);">${extraHtml}</div>` : ''}
            <div class="modal-buttons">
                <button type="button" class="btn-save" style="background: var(--color-gray);" onclick="closeErrorModal()">Close</button>
            </div>
        </div>
    `;

    // Show the modal
    errorModal.classList.add('active');
};

window.closeErrorModal = function () {
    const errorModal = document.getElementById('errorModal');
    if (errorModal) {
        errorModal.classList.remove('active');
    }
};

window.showConfirmModal = function (message, onConfirm) {
    // Create confirm modal if it doesn't exist
    let confirmModal = document.getElementById('confirmationModal');
    if (!confirmModal) {
        confirmModal = document.createElement('div');
        confirmModal.id = 'confirmationModal';
        confirmModal.className = 'modal';
        document.body.appendChild(confirmModal);
    }

    // Update content
    confirmModal.innerHTML = `
        <div class="modal-content" style="min-height: auto;">
            <h3>Confirm Action</h3>
            <p style="color: var(--color-gray); margin-bottom: var(--spacing-lg);">${message}</p>
            <div class="modal-buttons">
                <button type="button" class="btn-save" id="confirmDeleteBtn" style="background: var(--color-error);" onmouseover="this.style.background='#c0392b'" onmouseout="this.style.background='var(--color-error)'">Delete</button>
                <button type="button" class="btn-cancel" onclick="closeConfirmModal()">Cancel</button>
            </div>
        </div>
    `;

    // Store the callback and attach to button
    window._confirmCallback = onConfirm;
    const deleteBtn = confirmModal.querySelector('#confirmDeleteBtn');
    if (deleteBtn) {
        deleteBtn.onclick = function() {
            if (window._confirmCallback) {
                const callback = window._confirmCallback; // Save reference BEFORE closing
                closeConfirmModal();
                callback(); // Execute AFTER closing
            } else {
                closeConfirmModal();
            }
        };
    }

    // Show the modal
    confirmModal.classList.add('active');
};

window.closeConfirmModal = function () {
    const confirmModal = document.getElementById('confirmationModal');
    if (confirmModal) {
        confirmModal.classList.remove('active');
    }
    window._confirmCallback = null;
};

// Global Modal Keyboard Shortcuts (Enter = Confirm, Esc = Cancel)
document.addEventListener('keydown', function (e) {
    // Find the active modal (either via .active class or inline flex display)
    const allModals = document.querySelectorAll('.modal, .modal-overlay');
    let activeModal = null;
    
    for (const modal of allModals) {
        if (modal.classList.contains('active') || (modal.style.display === 'flex' && !modal.classList.contains('hidden'))) {
            activeModal = modal;
            break;
        }
    }
    
    if (!activeModal) return;

    // 1. Handle Escape (Cancel/Close)
    if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        // Priority order for close actions
        const cancelBtn = activeModal.querySelector('.btn-cancel, .modal-close, .btn-secondary, #closeModalBtn');
        if (cancelBtn) {
            e.preventDefault();
            cancelBtn.click();
        } else {
            // Fallback: try common close functions or just hide
            if (typeof closeConfirmModal === 'function' && activeModal.id === 'confirmationModal') closeConfirmModal();
            else if (typeof closeSuccessModal === 'function' && activeModal.id === 'successModal') closeSuccessModal();
            else if (typeof closeErrorModal === 'function' && activeModal.id === 'errorModal') closeErrorModal();
            else if (typeof closeModal === 'function') closeModal(activeModal.id);
            else {
                activeModal.classList.remove('active');
                activeModal.style.display = 'none';
            }
        }
        return;
    }

    // 2. Handle Enter (Confirm/Save)
    if (e.key === 'Enter') {
        // Don't trigger if user is in a textarea (where Enter is for new lines)
        if (e.target.tagName === 'TEXTAREA') return;
        
        e.stopImmediatePropagation();
        
        // Priority order for confirm actions
        // We look for save/primary buttons first
        const confirmBtn = activeModal.querySelector('.btn-save, .btn-primary, #confirmDeleteBtn, #successModalDoneBtn, .btn-confirm, .btn-save-changes, .btn-create');
        
        if (confirmBtn) {
            // Check if button is actually visible and not disabled
            if (confirmBtn.offsetParent !== null && !confirmBtn.disabled) {
                e.preventDefault();
                confirmBtn.click();
            }
        }
    }
});
