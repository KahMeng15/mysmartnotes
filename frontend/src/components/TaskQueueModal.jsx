import React, { useState, useEffect } from 'react';
import { Card, Text, Group, Progress, ActionIcon, ScrollArea, Stack, CloseButton, Portal, Loader } from '@mantine/core';
import { IconX, IconCheck, IconAlertCircle, IconChevronUp, IconChevronDown } from '@tabler/icons-react';
import { fetchApi } from '../lib/api';

export default function TaskQueueModal() {
  const [tasks, setTasks] = useState([]);
  const [dismissedTaskIds, setDismissedTaskIds] = useState(new Set());
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    // Only run if user is logged in
    if (!localStorage.getItem('token')) return;

    const fetchTasks = async () => {
      try {
        const data = await fetchApi('/search/tasks/active');
        if (data && data.tasks) {
          setTasks(data.tasks);
        }
      } catch (err) {
        console.error('Failed to fetch tasks', err);
      }
    };

    fetchTasks();
    const interval = setInterval(fetchTasks, 3000);
    return () => clearInterval(interval);
  }, []);

  // active tasks minus dismissed minus chat
  const visibleTasks = tasks.filter(t => !dismissedTaskIds.has(t.task_id) && t.task_type !== 'chat_response');

  if (visibleTasks.length === 0) return null;

  const handleCancel = async (taskId) => {
    try {
      await fetchApi(`/search/tasks/${taskId}/cancel`, { method: 'POST' });
      setTasks(prev => prev.map(t => t.task_id === taskId ? { ...t, status: 'failed', error: 'Cancelled by user' } : t));
    } catch (err) {
      console.error('Failed to cancel task', err);
    }
  };

  const handleDismiss = (taskId) => {
    setDismissedTaskIds(prev => new Set(prev).add(taskId));
  };

  const getTaskIcon = (status) => {
    if (status === 'completed') return <IconCheck size={16} color="green" />;
    if (status === 'failed') return <IconAlertCircle size={16} color="red" />;
    return <Loader size={16} />;
  };

  return (
    <Portal>
      <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 1000, width: 350, transition: 'all 0.3s ease' }}>
        <Card shadow="xl" padding="md" radius="md" withBorder style={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(10px)' }}>
          <Group justify="space-between" mb={isMinimized ? 0 : "sm"}>
            <Text fw={600} size="sm">Background Tasks ({visibleTasks.length})</Text>
            <Group gap="xs">
              <ActionIcon variant="subtle" size="sm" onClick={() => setIsMinimized(!isMinimized)}>
                {isMinimized ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
              </ActionIcon>
            </Group>
          </Group>

          {!isMinimized && (
            <ScrollArea.Autosize maxHeight={300} offsetScrollbars>
              <Stack gap="xs">
                {visibleTasks.map((task, index) => {
                  let title = task.task_type;
                  if (task.input_data && task.input_data.kwargs && task.input_data.kwargs.title) {
                    title = task.input_data.kwargs.title;
                  } else if (task.input_data && task.input_data.kwargs && task.input_data.kwargs.file_path) {
                    title = task.input_data.kwargs.file_path.split('/').pop();
                  }

                  let typeLabel = task.task_type;
                  if (typeLabel === 'resource_processing' || typeLabel === 'ocr') typeLabel = 'Processing resource';
                  if (typeLabel === 'exercise_extraction') typeLabel = 'Extracting exercise';
                  if (typeLabel === 'note_generation') typeLabel = 'Generating note';
                  if (typeLabel === 'embedding') typeLabel = 'Indexing resource';

                  const isRunning = task.status === 'pending' || task.status === 'processing' || task.status === 'running';
                  const statusFormatted = task.status.charAt(0).toUpperCase() + task.status.slice(1);
                  const displaySubtitle = `${typeLabel} (${isRunning ? 'Running' : statusFormatted})`;

                  return (
                    <div key={task.task_id} style={{ 
                      paddingBottom: '8px', 
                      paddingTop: index === 0 ? '4px' : '8px',
                      borderBottom: index < visibleTasks.length - 1 ? '1px solid #eaeaea' : 'none' 
                    }}>
                      <Group justify="space-between" wrap="nowrap" align="flex-start">
                        <Group gap="xs" wrap="nowrap" style={{ flex: 1, overflow: 'hidden' }}>
                          {getTaskIcon(task.status)}
                          <div style={{ flex: 1, overflow: 'hidden' }}>
                            <Text size="sm" fw={500} truncate>{title}</Text>
                            <Text size="xs" c="dimmed" truncate>{displaySubtitle}</Text>
                          </div>
                        </Group>
                        <Group gap={4}>
                          {isRunning && (
                            <ActionIcon color="red" variant="subtle" size="sm" onClick={() => handleCancel(task.task_id)} title="Cancel task">
                              <IconX size={14} />
                            </ActionIcon>
                          )}
                          {!isRunning && (
                            <CloseButton size="sm" onClick={() => handleDismiss(task.task_id)} title="Dismiss" />
                          )}
                        </Group>
                      </Group>
                      
                      {isRunning && (
                        <Progress 
                          value={task.progress || 0} 
                          size="xs" 
                          mt={8} 
                          animated={task.status === 'processing' || task.status === 'running'} 
                          striped
                        />
                      )}
                      
                      {task.status === 'failed' && task.error && (
                        <Text size="xs" c="red" mt={4} truncate>{task.error}</Text>
                      )}
                    </div>
                  );
                })}
              </Stack>
            </ScrollArea.Autosize>
          )}
        </Card>
      </div>
    </Portal>
  );
}
