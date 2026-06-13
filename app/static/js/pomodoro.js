/**
 * Pomodoro Logic
 * Handles Timer, Stopwatch, Calendar, and Sidebar Sync
 */

const API_URL = '';
const syncChannel = new BroadcastChannel('pomodoro_sync');

// State
let timerMode = 'pomodoro'; // pomodoro, short_break, long_break, stopwatch
let timeLeft = 25 * 60;
let isRunning = false;
let timerInterval = null;
let startTime = null;

// Config
const MODES = {
    pomodoro: 25 * 60,
    short_break: 5 * 60,
    long_break: 15 * 60,
    stopwatch: 0
};

// Initial Load
window.addEventListener('load', async () => {
    checkPopout();
    initEventListeners();
    await loadSettings(); // Load user preferences first
    loadNotes();
    loadCalendar();
    loadDailyStats();
    
    // Restore state from localStorage if exists
    restoreState();

    // Listen for remote commands (from sidebar)
    syncChannel.onmessage = (event) => {
        if (event.data.type === 'COMMAND') {
            if (event.data.action === 'TOGGLE') {
                if (isRunning) pauseTimer();
                else startTimer();
            } else if (event.data.action === 'STOP') {
                stopTimer();
                resetTimer();
            }
        }
    };
});

async function loadSettings() {
    try {
        const res = await fetch('/study-sessions/settings');
        if (res.ok) {
            const s = await res.json();
            MODES.pomodoro = s.pomo_study_mins * 60;
            MODES.short_break = s.pomo_break_mins * 60;
            MODES.long_break = s.pomo_long_break_mins * 60;
            
            // If timer isn't running, update timeLeft to current mode's default
            if (!isRunning) {
                timeLeft = MODES[timerMode];
                updateDisplay();
            }
        }
    } catch (e) { console.error('Error loading settings', e); }
}

function initEventListeners() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });

    document.getElementById('startBtn').addEventListener('click', startTimer);
    document.getElementById('pauseBtn').addEventListener('click', pauseTimer);
    document.getElementById('resetBtn').addEventListener('click', resetTimer);
    
    const popoutBtn = document.getElementById('popoutBtn');
    if (popoutBtn) popoutBtn.addEventListener('click', openPopout);

    // Custom Time Settings
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            const section = document.getElementById('customTimeSection');
            section.style.display = section.style.display === 'none' ? 'block' : 'none';
            // Pre-fill with current mode's current timeLeft or default
            const m = Math.floor(timeLeft / 60);
            const s = timeLeft % 60;
            document.getElementById('customMins').value = m;
            document.getElementById('customSecs').value = s;
        });
    }

    document.getElementById('applyTimeBtn').addEventListener('click', () => {
        const m = parseInt(document.getElementById('customMins').value) || 0;
        const s = parseInt(document.getElementById('customSecs').value) || 0;
        const total = (m * 60) + s;
        if (total <= 0 && timerMode !== 'stopwatch') return alert('Please set a valid duration');
        
        timeLeft = total;
        if (timerMode !== 'stopwatch') MODES[timerMode] = total; // Update current session default
        
        updateDisplay();
        saveState();
        document.getElementById('customTimeSection').style.display = 'none';
    });

    const saveDefaultBtn = document.getElementById('saveDefaultBtn');
    if (saveDefaultBtn) {
        saveDefaultBtn.addEventListener('click', saveDefaultSettings);
    }
}

async function saveDefaultSettings() {
    try {
        const payload = {
            pomo_study_mins: Math.round(MODES.pomodoro / 60),
            pomo_break_mins: Math.round(MODES.short_break / 60),
            pomo_long_break_mins: Math.round(MODES.long_break / 60)
        };
        const res = await fetch('/study-sessions/settings', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        if (res.ok) alert('Timer preferences saved to account');
    } catch (e) { alert('Failed to save settings'); }
}

function setMode(mode) {
    if (isRunning && !confirm('Switching modes will reset your current timer. Continue?')) return;
    
    stopTimer();
    timerMode = mode;
    timeLeft = MODES[mode];
    
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    const modeLabel = document.getElementById('modeLabel');
    if (modeLabel) modeLabel.textContent = mode.replace('_', ' ');
    
    updateDisplay();
    saveState();
}

function updateDisplay() {
    const display = document.getElementById('timerDisplay');
    const minutes = Math.floor(Math.abs(timeLeft) / 60);
    const seconds = Math.abs(timeLeft) % 60;
    
    const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    display.textContent = (timeLeft < 0 ? '-' : '') + timeStr;
    document.title = isRunning ? `${timeStr} - ${timerMode.replace('_', ' ')}` : 'Pomodoro';
    
    // Sync with sidebar
    syncChannel.postMessage({ type: 'TICK', timeLeft, isRunning, mode: timerMode });
}

function startTimer() {
    if (isRunning) return;
    
    // Request Notification Permission on first start (user-generated event)
    if (Notification.permission === 'default') {
        Notification.requestPermission();
    }

    isRunning = true;
    startTime = startTime || new Date();
    
    document.getElementById('startBtn').style.display = 'none';
    document.getElementById('pauseBtn').style.display = 'inline-block';
    
    // Tell sidebar to stop its local interval because the master is here
    syncChannel.postMessage({ type: 'TICK', timeLeft, isRunning, mode: timerMode });

    timerInterval = setInterval(() => {
        if (timerMode === 'stopwatch') {
            timeLeft++;
        } else {
            timeLeft--;
            if (timeLeft <= 0) {
                finishSession();
            }
        }
        updateDisplay();
        saveState();
    }, 1000);
}

function pauseTimer() {
    isRunning = false;
    clearInterval(timerInterval);
    document.getElementById('startBtn').style.display = 'inline-block';
    document.getElementById('pauseBtn').style.display = 'none';
    saveState();
    syncChannel.postMessage({ type: 'TICK', timeLeft, isRunning, mode: timerMode });
}

function stopTimer() {
    pauseTimer();
    startTime = null;
    syncChannel.postMessage({ type: 'TICK', timeLeft, isRunning: false, mode: timerMode });
}

function resetTimer() {
    stopTimer();
    timeLeft = MODES[timerMode];
    updateDisplay();
    saveState();
}

async function finishSession() {
    stopTimer();
    const sound = document.getElementById('timerEndSound');
    if (sound) sound.play();
    
    // Notify user
    if (Notification.permission === 'granted') {
        new Notification("Time's up!", { body: `Your ${timerMode.replace('_', ' ')} session has finished.` });
    }

    // Save to database
    await saveSessionToDB();
    
    // Reset or Switch mode
    if (timerMode === 'pomodoro') {
        alert('Pomodoro finished! Take a break.');
        setMode('short_break');
    } else {
        alert('Break finished! Ready to focus?');
        setMode('pomodoro');
    }
    
    loadCalendar();
    loadDailyStats();
}

async function saveSessionToDB() {
    try {
        const duration = Math.floor(Math.abs(MODES[timerMode] - timeLeft) / 60) || 1;
        if (duration < 0.5 && timerMode !== 'stopwatch') return;

        const payload = {
            note_id: document.getElementById('noteSelect').value || null,
            session_type: `pomodoro_${timerMode === 'pomodoro' ? 'study' : 'break'}`,
            duration_minutes: duration,
            start_time: startTime ? startTime.toISOString() : new Date().toISOString(),
            end_time: new Date().toISOString(),
            status: 'completed'
        };

        await fetch('/study-sessions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        console.error('Failed to save session', e);
    }
}

async function loadNotes() {
    try {
        const res = await fetch('/notes');
        const notes = await res.json();
        const select = document.getElementById('noteSelect');
        notes.forEach(l => {
            const opt = document.createElement('option');
            opt.value = l.id;
            opt.textContent = l.title;
            select.appendChild(opt);
        });
    } catch (e) {}
}

async function loadCalendar() {
    try {
        const res = await fetch('/study-sessions/calendar?days=30');
        const data = await res.json();
        renderCalendar(data);
    } catch (e) {}
}

function renderCalendar(data) {
    const grid = document.getElementById('calendarGrid');
    if (!grid) return;
    grid.innerHTML = '';
    
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(today.getDate() - i);
        const dStr = d.toISOString().split('T')[0];
        
        const dayData = data.find(x => x.date === dStr) || { study_minutes: 0, break_minutes: 0 };
        const level = getIntensityLevel(dayData.study_minutes);
        
        const cell = document.createElement('div');
        cell.className = `calendar-cell level-${level}`;
        cell.title = `${d.toLocaleDateString()}: ${dayData.study_minutes}m study, ${dayData.break_minutes}m break`;
        
        grid.appendChild(cell);
    }
}

function getIntensityLevel(mins) {
    if (mins === 0) return 0;
    if (mins < 30) return 1;
    if (mins < 60) return 2;
    if (mins < 120) return 3;
    return 4;
}

async function loadDailyStats() {
    try {
        const res = await fetch('/analytics/dashboard-summary');
        const data = await res.json();
        document.getElementById('todayPomos').textContent = Math.floor(data.study_time_7d_mins / 25);
        document.getElementById('todayMinutes').textContent = `${data.study_time_7d_mins}m`;
    } catch (e) {}
}

function saveState() {
    const state = { timeLeft, timerMode, isRunning, startTime: startTime ? startTime.getTime() : null };
    localStorage.setItem('pomodoroState', JSON.stringify(state));
}

function restoreState() {
    const saved = localStorage.getItem('pomodoroState');
    if (!saved) return;
    
    const state = JSON.parse(saved);
    timerMode = state.timerMode || 'pomodoro';
    timeLeft = state.timeLeft;
    
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === timerMode);
    });

    if (state.isRunning) {
        startTime = state.startTime ? new Date(state.startTime) : new Date();
        startTimer();
    } else {
        updateDisplay();
    }
}

function checkPopout() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('popout') === 'true') {
        document.body.classList.add('popout-mode');
    }
}

function openPopout() {
    window.open('/pomodoro_popout.html?popout=true', 'PomodoroTimer', 'width=400,height=450,menubar=no,toolbar=no,location=no,status=no');
}
