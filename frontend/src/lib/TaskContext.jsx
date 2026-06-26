import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { fetchApi } from './api';

const TaskContext = createContext(null);

const ACTIVE_STATUSES = ['pending', 'processing', 'running'];
const POLL_INTERVAL = 3000;

function hasActiveTasks(tasks) {
  return tasks.some(t => ACTIVE_STATUSES.includes(t.status));
}

export function TaskProvider({ children }) {
  const [tasks, setTasks] = useState([]);
  const pollRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchTasks = useCallback(async () => {
    try {
      const data = await fetchApi('/search/tasks/active');
      if (data && data.tasks) {
        setTasks(data.tasks);
        if (!hasActiveTasks(data.tasks)) {
          stopPolling();
        }
      }
    } catch (err) {
      console.error('Failed to fetch tasks', err);
    }
  }, [stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(fetchTasks, POLL_INTERVAL);
  }, [stopPolling, fetchTasks]);

  const handleTaskStarted = useCallback(() => {
    fetchTasks();
    startPolling();
  }, [fetchTasks, startPolling]);

  useEffect(() => {
    if (!localStorage.getItem('token')) return;

    // Initial fetch — then poll only if there are active tasks
    fetchTasks().then(result => {
      if (result && hasActiveTasks(result)) {
        startPolling();
      }
    });

    window.addEventListener('task_started', handleTaskStarted);

    return () => {
      stopPolling();
      window.removeEventListener('task_started', handleTaskStarted);
    };
  }, [fetchTasks, startPolling, stopPolling, handleTaskStarted]);

  return (
    <TaskContext.Provider value={{ tasks, refreshTasks: fetchTasks }}>
      {children}
    </TaskContext.Provider>
  );
}

export function useTaskContext() {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error('useTaskContext must be used within TaskProvider');
  return ctx;
}
