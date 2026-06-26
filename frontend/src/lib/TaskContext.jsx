import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { fetchApi } from './api';

const TaskContext = createContext(null);

const POLL_INTERVAL = 3000;

export function TaskProvider({ children }) {
  const [tasks, setTasks] = useState([]);
  const pollRef = useRef(null);

  const fetchTasks = useCallback(async () => {
    try {
      const data = await fetchApi('/search/tasks/active');
      if (data && data.tasks) {
        setTasks(data.tasks);
      }
    } catch (err) {
      console.error('Failed to fetch tasks', err);
    }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem('token')) return;

    fetchTasks();
    pollRef.current = setInterval(fetchTasks, POLL_INTERVAL);

    const handleTaskStarted = () => {
      fetchTasks();
    };
    window.addEventListener('task_started', handleTaskStarted);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      window.removeEventListener('task_started', handleTaskStarted);
    };
  }, [fetchTasks]);

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
