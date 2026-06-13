import React, { useState, useEffect, useRef } from 'react';
import { Box, Container, Title, Text, Button, Center, Loader, Select, ScrollArea, Group, ActionIcon, Stack, Paper, Modal, Progress, Badge, Tooltip, NavLink as MantineNavLink, SegmentedControl, Textarea, TextInput, Menu, Code } from '@mantine/core';
import { IconRobot, IconAlertCircle, IconFileText, IconCheck, IconChevronLeft, IconLayoutSidebarRightCollapse, IconLayoutSidebarRightExpand, IconSparkles, IconBolt, IconWand, IconBrain, IconSchool, IconBabyCarriage, IconList, IconListNumbers, IconTable, IconFile, IconLayersLinked, IconBinaryTree, IconCpu } from '@tabler/icons-react';
import * as TablerIcons from '@tabler/icons-react';

const MODE_ICONS = {
  quick: <IconBolt size={14} />,
  simple: <IconWand size={14} />,
  normal: <IconBrain size={14} />,
  elaborate: <IconSchool size={14} />,
  eli5: <IconBabyCarriage size={14} />,
};

const FORMAT_ICONS = {
  sentence: <IconFileText size={14} />,
  pointform: <IconList size={14} />,
  numbered_list: <IconListNumbers size={14} />,
  table: <IconTable size={14} />,
};

const METHOD_ICONS = {
  whole: <IconFile size={14} />,
  section: <IconLayersLinked size={14} />,
  chunked: <IconCpu size={14} />,
  hierarchical: <IconBinaryTree size={14} />,
};

const getIconComponent = (iconName) => {
  if (!iconName) return TablerIcons.IconFileText;
  if (TablerIcons[iconName]) return TablerIcons[iconName];
  
  // Try to fix formatting: e.g. 'school' -> 'IconSchool', 'file-text' -> 'IconFileText'
  const formattedName = 'Icon' + iconName.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join('');
  if (TablerIcons[formattedName]) return TablerIcons[formattedName];
  
  return TablerIcons.IconFileText;
};

const formatDate = (dateString) => {
  const d = new Date(dateString);
  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const day = d.getDate();
  const month = d.toLocaleString('en-US', { month: 'long' });
  const year = d.getFullYear();
  return `${hours}.${minutes}${ampm}, ${day} ${month} ${year}`;
};

import { useNavigate, useParams } from 'react-router-dom';
import { fetchApi } from '../lib/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function SummaryView() {
  const { noteId, summaryId } = useParams();
  const navigate = useNavigate();

  const [note, setNote] = useState(null);
  const [summaries, setSummaries] = useState([]);
  const [selectedSummary, setSelectedSummary] = useState(null);
  const [summaryContent, setSummaryContent] = useState('');
  const [currentTaskId, setCurrentTaskId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [generatingSummaryId, setGeneratingSummaryId] = useState(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [deleteModalSummary, setDeleteModalSummary] = useState(null);
  const [renameModalSummary, setRenameModalSummary] = useState(null);
  const [infoModalSummary, setInfoModalSummary] = useState(null);
  const [renameInput, setRenameInput] = useState('');
  const [taskStatus, setTaskStatus] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const viewportRef = useRef(null);
  const markdownRef = useRef(null);

  const [mode, setMode] = useState('normal');
  const [outputFormat, setOutputFormat] = useState('sentence');
  const [processingMethod, setProcessingMethod] = useState('whole');
  
  const [parameterType, setParameterType] = useState('multi'); // 'multi' or 'single'
  const [globalPrompts, setGlobalPrompts] = useState([]);
  const firstH1Ref = useRef({ id: null, offset: null });
  const [selectedPromptId, setSelectedPromptId] = useState('custom');
  const [customPromptText, setCustomPromptText] = useState('');
  const [promptInput, setPromptInput] = useState('');
  const [generatingPrompt, setGeneratingPrompt] = useState(false);

  useEffect(() => {
    fetchApi('/admin/global-prompts').then(data => {
      setGlobalPrompts(data || []);
    }).catch(err => console.error("Failed to load global prompts", err));
  }, []);

  useEffect(() => {
    fetchApi('/auth/me').then(data => {
      if (data && data.action_sidebar_open !== undefined) {
        setSidebarOpen(data.action_sidebar_open);
      }
    }).catch(err => console.error("Failed to load user preferences", err));
  }, []);

  const toggleSidebar = async () => {
    const newState = !sidebarOpen;
    setSidebarOpen(newState);
    try {
      await fetchApi('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ action_sidebar_open: newState })
      });
    } catch (e) {
      console.error("Failed to save sidebar state", e);
    }
  };

  useEffect(() => {
    if (!noteId) {
      navigate('/dashboard');
      return;
    }
    
    const loadNote = async () => {
      try {
        const data = await fetchApi(`/notes/${noteId}?t=${Date.now()}`);
        setNote(data);
      } catch (err) {
        console.error("Failed to load note", err);
      }
    };
    loadNote();
    loadSummaries().then(() => {
      fetchApi('/search/tasks/active').then(activeData => {
        if (activeData && activeData.tasks) {
          const task = activeData.tasks.find(t => t.task_type === 'summary_generation' && String(t.input_data?.note_id) === String(noteId));
          if (task) {
            const genId = task.input_data?.summary_id || 'generating';
            setCurrentTaskId(task.task_id);
            setGenerating(true);
            setGeneratingSummaryId(genId);
            setTaskStatus(task);
            setSummaries(prev => {
              if (!prev.some(s => s.id === genId)) {
                 const mockVersion = {
                   id: genId,
                   version: prev.length > 0 ? prev[0].version + 1 : 1,
                   created_at: task.created_at || new Date().toISOString(),
                   mode: task.input_data?.mode || 'Generating...',
                   output_format: task.input_data?.output_format || '',
                   processing_method: task.input_data?.processing_method || '',
                   prompt_name: task.input_data?.prompt_name,
                   prompt_icon: task.input_data?.prompt_icon
                 };
                 return [mockVersion, ...prev];
              }
              return prev;
            });
          }
        }
      }).catch(e => console.error("Failed to fetch active tasks", e));
    });
  }, [noteId]);

  useEffect(() => {
    let interval;
    if (generating && currentTaskId) {
      interval = setInterval(checkTaskStatus, 1500);
    }
    return () => clearInterval(interval);
  }, [generating, currentTaskId]);

  const checkTaskStatus = async () => {
    if (!currentTaskId) return;
    try {
      const statusData = await fetchApi(`/search/tasks/${currentTaskId}`);
      if (statusData) {
        setTaskStatus(statusData);
        if (statusData.status === 'completed' || statusData.status === 'failed') {
          setGenerating(false);
          setGeneratingSummaryId(null);
          setCurrentTaskId(null);
          if (statusData.status === 'completed') {
             loadSummaries(true);
          } else {
             loadSummaries();
          }
        }
      }
    } catch (e) {
      console.error("Failed to fetch task status", e);
    }
  };

  const loadSummaries = async (selectNewest = false) => {
    try {
      setLoading(true);
      const data = await fetchApi(`/summaries?note_id=${noteId}`);
      const filtered = data.filter(d => d.summary_type === 'summary').sort((a, b) => b.version - a.version);
      
      setSummaries(prev => {
        const isGenerating = generating && generatingSummaryId;
        if (isGenerating && !selectNewest) {
           return [prev.find(s => s.id === generatingSummaryId), ...filtered];
        }
        return filtered;
      });

      if (filtered.length > 0) {
        if (selectNewest === true) {
          loadSummaryContent(filtered[0].id);
        } else if (summaryId && summaryId !== generatingSummaryId) {
          const target = filtered.find(s => s.id === summaryId);
          if (target) {
            loadSummaryContent(target.id);
          } else {
            loadSummaryContent(filtered[0].id);
          }
        } else if (summaryId !== generatingSummaryId) {
          loadSummaryContent(filtered[0].id);
        } else {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error("Failed to load summaries", err);
      setError("Failed to load summaries");
      setLoading(false);
    }
  };

  const loadSummaryContent = async (id) => {
    if (generating && id === generatingSummaryId) {
      setSelectedSummary(null);
      navigate(`/note/${noteId}/summary/${id}`, { replace: true });
      return;
    }
    try {
      setLoading(true);
      const data = await fetchApi(`/summaries/${id}`);
      setSelectedSummary(data);
      setSummaryContent(data.content);
      navigate(`/note/${noteId}/summary/${id}`, { replace: true });
    } catch (err) {
      console.error("Failed to load summary content", err);
      setError("Failed to load summary content");
    } finally {
      setLoading(false);
    }
  };

  const handleRename = (summary, e) => {
    e.stopPropagation();
    const details = summary.prompt_name || [summary.mode, summary.output_format, summary.processing_method].filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' • ');
    const defaultTitle = details || `Version ${summary.version}`;
    const currentName = summary.is_user_edited ? summary.title : defaultTitle;
    
    setRenameInput(currentName);
    setRenameModalSummary(summary);
  };

  const confirmRename = async () => {
    if (!renameModalSummary || !renameInput.trim()) return;
    
    const details = renameModalSummary.prompt_name || [renameModalSummary.mode, renameModalSummary.output_format, renameModalSummary.processing_method].filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' • ');
    const currentName = renameModalSummary.is_user_edited ? renameModalSummary.title : (details || `Version ${renameModalSummary.version}`);
    
    if (renameInput === currentName) {
      setRenameModalSummary(null);
      return;
    }
    
    try {
      await fetchApi(`/summaries/${renameModalSummary.id}/rename`, {
        method: 'PATCH',
        body: JSON.stringify({ title: renameInput })
      });
      setSummaries(summaries.map(s => s.id === renameModalSummary.id ? { ...s, title: renameInput, is_user_edited: true } : s));
      if (selectedSummary?.id === renameModalSummary.id) {
        setSelectedSummary({ ...selectedSummary, title: renameInput, is_user_edited: true });
      }
      setRenameModalSummary(null);
    } catch (err) {
      console.error('Failed to rename', err);
    }
  };

  const handlePin = async (summary, e) => {
    e.stopPropagation();
    try {
      await fetchApi(`/summaries/${summary.id}/pin`, { method: 'PATCH' });
      const updated = summaries.map(s => s.id === summary.id ? { ...s, is_pinned: !s.is_pinned } : s);
      setSummaries(updated.sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
        return b.version - a.version;
      }));
    } catch (err) {
      console.error('Failed to pin', err);
    }
  };

  const handleDelete = (summary, e) => {
    e.stopPropagation();
    setDeleteModalSummary(summary);
  };

  const confirmDelete = async () => {
    if (!deleteModalSummary) return;
    try {
      await fetchApi(`/summaries/${deleteModalSummary.id}`, { method: 'DELETE' });
      setSummaries(summaries.filter(s => s.id !== deleteModalSummary.id));
      if (selectedSummary?.id === deleteModalSummary.id) {
        setSelectedSummary(null);
        navigate(`/note/${noteId}/summary`, { replace: true });
      }
      setDeleteModalSummary(null);
    } catch (err) {
      console.error('Failed to delete', err);
    }
  };

  const generateCustomPrompt = async () => {
    if (!promptInput.trim()) return;
    try {
      setGeneratingPrompt(true);
      const res = await fetchApi('/summaries/generate-prompt', {
        method: 'POST',
        body: JSON.stringify({ user_input: promptInput })
      });
      if (res && res.prompt) {
        setCustomPromptText(res.prompt);
      }
    } catch (err) {
      console.error("Failed to generate prompt", err);
    } finally {
      setGeneratingPrompt(false);
    }
  };

  const startGenerateSummary = async () => {
    try {
      setGenerating(true);
      setModalOpened(false);
      setTaskStatus({ progress: 0, status: 'pending' });
      setSelectedSummary(null);
      
      const nextVersion = summaries.filter(s => !(generating && s.id === generatingSummaryId)).length > 0 
        ? summaries.filter(s => !(generating && s.id === generatingSummaryId))[0].version + 1 
        : 1;

      let finalPrompt = null;
      let finalPromptName = null;
      let finalPromptIcon = null;
      if (parameterType === 'single') {
        if (selectedPromptId === 'custom') {
          finalPrompt = customPromptText;
          finalPromptName = "Custom User Prompt";
          finalPromptIcon = "IconUserEdit";
        } else {
          const gp = globalPrompts.find(p => p.id.toString() === selectedPromptId);
          if (gp) {
            finalPrompt = gp.content;
            finalPromptName = gp.name;
            finalPromptIcon = gp.icon;
          }
        }
      }

      const res = await fetchApi('/summaries/summary', {
        method: 'POST',
        body: JSON.stringify({
          note_id: noteId,
          mode: mode,
          output_format: outputFormat,
          processing_method: processingMethod,
          custom_prompt: finalPrompt,
          prompt_name: finalPromptName,
          prompt_icon: finalPromptIcon
        })
      });
      if (res && res.is_cached) {
         setGenerating(false);
         navigate(`/note/${noteId}/summary/${res.id}`, { replace: true });
      } else if (res && res.task_id && res.summary_id) {
         setGeneratingSummaryId(res.summary_id);
         setCurrentTaskId(res.task_id);
         
         const mockVersion = {
           id: res.summary_id,
           version: nextVersion,
           created_at: new Date().toISOString(),
           mode: mode,
           output_format: outputFormat,
           processing_method: processingMethod,
           prompt_name: finalPromptName,
           prompt_icon: finalPromptIcon
         };

         setSummaries(prev => [mockVersion, ...prev.filter(s => s.id !== res.summary_id && s.id !== 'generating')]);
         navigate(`/note/${noteId}/summary/${res.summary_id}`, { replace: true });
      } else {
         setGenerating(false);
         setError("Failed to start summary generation");
      }
    } catch (err) {
      console.error("Failed to generate summary", err);
      setError("Failed to start summary generation");
      setGenerating(false);
    }
  };

  const handleScroll = () => {
    if (!viewportRef.current || !markdownRef.current) return;
    const viewportRect = viewportRef.current.getBoundingClientRect();
    const viewportTop = viewportRect.top;

      let activeEls = [];
      let currentAccumulatedTop = 0;

      for (let i = 1; i <= 6; i++) {
        const tag = `h${i}`;
        const elements = Array.from(markdownRef.current.querySelectorAll(tag));
        let activeEl = null;

        for (const el of elements) {
          const targetEl = el.closest('.summary-header') || el;
          const rect = targetEl.getBoundingClientRect();
          if (rect.top <= viewportTop + currentAccumulatedTop + 5) {
            activeEl = el;
          }
        }

        if (activeEl) {
          for (let j = 1; j < i; j++) {
            if (activeEls[j]) {
              if (activeEl.compareDocumentPosition(activeEls[j]) & Node.DOCUMENT_POSITION_FOLLOWING) {
                activeEl = null;
                break;
              }
            }
          }
        }
        
        activeEls[i] = activeEl;

        for (const el of elements) {
          const targetEl = el.closest('.summary-header') || el;
          if (el === activeEl) {
            targetEl.style.opacity = 1;
            targetEl.style.pointerEvents = 'auto';
          } else if (targetEl.getBoundingClientRect().top <= viewportTop + currentAccumulatedTop + 5) {
            targetEl.style.opacity = 0;
            targetEl.style.pointerEvents = 'none';
          } else {
            targetEl.style.opacity = 1;
            targetEl.style.pointerEvents = 'auto';
          }
        }

        let h = 0;
        if (activeEl) {
          const targetActiveEl = activeEl.closest('.summary-header') || activeEl;
          h = targetActiveEl.offsetHeight;
        }

        currentAccumulatedTop += h;
        if (i < 6) {
          markdownRef.current.style.setProperty(`--h${i + 1}-top`, `${currentAccumulatedTop}px`);
        }
      }
  };

  useEffect(() => {
    setTimeout(handleScroll, 100);
  }, [summaryContent]);

  if (!noteId) return null;

  const isFailed = taskStatus?.status === 'failed';
  const processingProgress = taskStatus?.progress || 10;

  return (
    <Box h="100vh" style={{ display: 'flex', flexDirection: 'column' }}>
      <style>{`
        .clickable-crumb {
          cursor: pointer;
        }
        .clickable-crumb:hover {
          text-decoration: underline;
        }
        .sticky-markdown {
          font-family: 'Instrument Sans', sans-serif;
          color: #171738;
          line-height: 1.0;
          font-size: 16px;
        }
        .sticky-markdown .summary-header,
        .sticky-markdown h1,
        .sticky-markdown h2,
        .sticky-markdown h3,
        .sticky-markdown h4,
        .sticky-markdown h5,
        .sticky-markdown h6 {
          position: sticky;
          background-color: #ffffff;
          margin-top: 0;
          padding-top: 0.3rem;
          padding-bottom: 0.1rem;
          line-height: 1.1;
          z-index: 10;
          border-bottom: 1px solid #eaeaea;
        }
        .sticky-markdown .summary-header { top: 0; z-index: 16; }
        .sticky-markdown .summary-header h1 {
          position: static;
          background-color: transparent;
          border-bottom: none;
          padding: 0;
          font-size: 2.2rem;
          margin: 0;
        }
        .sticky-markdown h1 { top: 0; z-index: 16; font-size: 2.2rem; }
        .sticky-markdown h2 { top: var(--h2-top, 3.5rem); z-index: 15; font-size: 1.8rem; }
        .sticky-markdown h3 { top: var(--h3-top, 6.5rem); z-index: 14; font-size: 1.5rem; }
        .sticky-markdown h4 { top: var(--h4-top, 9rem); z-index: 13; font-size: 1.25rem; }
        .sticky-markdown h5 { top: var(--h5-top, 11rem); z-index: 12; font-size: 1.1rem; }
        .sticky-markdown h6 { top: var(--h6-top, 13rem); z-index: 11; font-size: 1rem; }
        .sticky-markdown p { margin-bottom: 0.5rem; }
        .sticky-markdown ul, .sticky-markdown ol { margin-top: 0; margin-bottom: 0.5rem; padding-left: 1.5rem; }
        .sticky-markdown li { margin-bottom: 0.2rem; }
        .sticky-markdown li p { margin: 0; }
        .sticky-markdown strong { font-weight: 700; }
        .sticky-markdown blockquote {
          border-left: 4px solid #3b82f6;
          margin: 1.5rem 0;
          padding: 0.5rem 0 0.5rem 1.5rem;
          background-color: #f8f9fa;
          color: #4b5563;
        }
        .sticky-markdown code {
          background-color: #f1f3f5;
          padding: 0.2rem 0.4rem;
          border-radius: 4px;
          font-family: monospace;
          font-size: 0.9em;
        }
        .sticky-markdown table {
          border-collapse: collapse;
          width: 100%;
          margin-bottom: 1rem;
        }
        .sticky-markdown th, .sticky-markdown td {
          border: 1px solid #dee2e6;
          padding: 0.5rem;
        }
        .sticky-markdown th {
          background-color: #f8f9fa;
        }
      `}</style>
      <Modal opened={!!deleteModalSummary} onClose={() => setDeleteModalSummary(null)} title="Delete Summary" centered>
        <Text size="sm" mb="lg">
          Are you sure you want to delete <b>{deleteModalSummary?.title || (deleteModalSummary && `Version ${deleteModalSummary.version}`) || 'this summary'}</b>? This action cannot be undone.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setDeleteModalSummary(null)}>Cancel</Button>
          <Button color="red" onClick={confirmDelete} data-autofocus>Delete</Button>
        </Group>
      </Modal>

      <Modal opened={!!renameModalSummary} onClose={() => setRenameModalSummary(null)} title="Rename Summary" centered>
        <TextInput
          label="Summary Name"
          placeholder="Enter a new name"
          value={renameInput}
          onChange={(e) => setRenameInput(e.currentTarget.value)}
          data-autofocus
          mb="lg"
          onKeyDown={(e) => e.key === 'Enter' && confirmRename()}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setRenameModalSummary(null)}>Cancel</Button>
          <Button onClick={confirmRename}>Save</Button>
        </Group>
      </Modal>

      <Modal opened={!!infoModalSummary} onClose={() => setInfoModalSummary(null)} title="System Information" centered size="lg">
        {infoModalSummary && (
          <Stack gap="sm">
            <Group justify="space-between">
              <Text size="sm" fw={500}>Note ID</Text>
              <Code>{infoModalSummary.note_id}</Code>
            </Group>
            <Group justify="space-between">
              <Text size="sm" fw={500}>Summary ID</Text>
              <Code>{infoModalSummary.id}</Code>
            </Group>
            <Group justify="space-between">
              <Text size="sm" fw={500}>Type</Text>
              <Badge color={infoModalSummary.prompt_name ? "grape" : "blue"}>{infoModalSummary.prompt_name ? "Single Parameter" : "Multi Parameter"}</Badge>
            </Group>
            
            {infoModalSummary.prompt_name ? (
              <Group justify="space-between">
                <Text size="sm" fw={500}>Prompt Name</Text>
                <Text size="sm">{infoModalSummary.prompt_name}</Text>
              </Group>
            ) : (
              <>
                <Group justify="space-between">
                  <Text size="sm" fw={500}>Mode</Text>
                  <Text size="sm" tt="capitalize">{infoModalSummary.mode || 'N/A'}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" fw={500}>Output Format</Text>
                  <Text size="sm" tt="capitalize">{infoModalSummary.output_format?.replace('_', ' ') || 'N/A'}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" fw={500}>Processing Method</Text>
                  <Text size="sm" tt="capitalize">{infoModalSummary.processing_method || 'N/A'}</Text>
                </Group>
                {infoModalSummary.split_level && (
                  <Group justify="space-between">
                    <Text size="sm" fw={500}>Split Level</Text>
                    <Text size="sm" tt="uppercase">{infoModalSummary.split_level}</Text>
                  </Group>
                )}
              </>
            )}
            
            <Group justify="space-between">
              <Text size="sm" fw={500}>AI Model</Text>
              <Text size="sm" c="dimmed">{infoModalSummary.model || 'Unknown'}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" fw={500}>Processing Time</Text>
              <Text size="sm" c="dimmed">
                {infoModalSummary.processing_time_ms ? `${(infoModalSummary.processing_time_ms / 1000).toFixed(2)}s` : 
                 infoModalSummary.processing_time ? `${infoModalSummary.processing_time.toFixed(2)}s` : 'Unknown'}
              </Text>
            </Group>
          </Stack>
        )}
      </Modal>

      <Modal opened={modalOpened} onClose={() => setModalOpened(false)} title="Summary Parameters" centered>
        <Stack>
          <SegmentedControl
            value={parameterType}
            onChange={setParameterType}
            data={[
              { label: 'Multi Parameters', value: 'multi' },
              { label: 'Single Parameter', value: 'single' },
            ]}
            fullWidth
          />

          {parameterType === 'multi' ? (
            <>
              <Select 
                label="AI Mode" 
                data={[
                  { value: 'quick', label: 'Quick' },
                  { value: 'simple', label: 'Simple' },
                  { value: 'normal', label: 'Normal' },
                  { value: 'elaborate', label: 'Elaborate' },
                  { value: 'eli5', label: 'Explain like I am 5' }
                ]} 
                value={mode} 
                onChange={setMode} 
                leftSection={MODE_ICONS[mode]}
                renderOption={({ option }) => (
                  <Group gap="sm">
                    {MODE_ICONS[option.value]}
                    <Text size="sm">{option.label}</Text>
                  </Group>
                )}
              />
              <Select 
                label="Output Format" 
                data={[
                  { value: 'sentence', label: 'Sentence' },
                  { value: 'pointform', label: 'Pointform' },
                  { value: 'numbered_list', label: 'Numbered List' },
                  { value: 'table', label: 'Table' }
                ]} 
                value={outputFormat} 
                onChange={setOutputFormat} 
                leftSection={FORMAT_ICONS[outputFormat]}
                renderOption={({ option }) => (
                  <Group gap="sm">
                    {FORMAT_ICONS[option.value]}
                    <Text size="sm">{option.label}</Text>
                  </Group>
                )}
              />
              <Select 
                label="Processing Method" 
                data={[
                  { value: 'whole', label: 'Whole Document (Fast)' },
                  { value: 'chunked', label: 'Chunked (Detailed)' },
                  { value: 'hierarchical', label: 'Hierarchical (Structured)' }
                ]} 
                value={processingMethod} 
                onChange={setProcessingMethod} 
                leftSection={METHOD_ICONS[processingMethod]}
                renderOption={({ option }) => (
                  <Group gap="sm">
                    {METHOD_ICONS[option.value]}
                    <Text size="sm">{option.label}</Text>
                  </Group>
                )}
              />
            </>
          ) : (
            <Stack>
              <Select
                label="Prompt Template"
                data={[
                  ...globalPrompts.map(p => ({ value: p.id.toString(), label: p.name, icon: p.icon })),
                  { value: 'custom', label: 'Custom Prompt', icon: 'IconUserEdit' }
                ]}
                value={selectedPromptId}
                onChange={setSelectedPromptId}
                leftSection={(() => {
                  const selected = selectedPromptId === 'custom' 
                    ? { icon: 'IconUserEdit' }
                    : globalPrompts.find(p => p.id.toString() === selectedPromptId);
                  const IconComp = getIconComponent(selected?.icon);
                  return <IconComp size={16} />;
                })()}
                renderOption={({ option }) => {
                  const IconComp = getIconComponent(option.icon);
                  return (
                    <Group gap="sm">
                      <IconComp size={16} />
                      <Text size="sm">{option.label}</Text>
                    </Group>
                  );
                }}
              />
              
              {selectedPromptId === 'custom' && (
                <Stack gap="xs">
                  <Textarea
                    label="Custom Prompt"
                    placeholder="Enter your prompt here..."
                    value={customPromptText}
                    onChange={(e) => setCustomPromptText(e.currentTarget.value)}
                    minRows={10}
                    autosize
                    maxRows={20}
                  />
                  
                  <Paper withBorder p="sm" radius="md" mt="xs">
                    <Stack gap="xs">
                      <Text size="sm" fw={500}>Or generate a prompt with AI:</Text>
                      <Group gap="sm" align="flex-end">
                        <TextInput
                          placeholder="E.g. generate a summary emphasizing key dates"
                          value={promptInput}
                          onChange={(e) => setPromptInput(e.currentTarget.value)}
                          style={{ flex: 1 }}
                        />
                        <Button
                          variant="light"
                          onClick={generateCustomPrompt}
                          loading={generatingPrompt}
                          leftSection={<IconSparkles size={16} />}
                        >
                          Generate
                        </Button>
                      </Group>
                    </Stack>
                  </Paper>
                </Stack>
              )}
            </Stack>
          )}

          <Button fullWidth mt="md" onClick={startGenerateSummary}>Start Generation</Button>
        </Stack>
      </Modal>

      {/* Sticky Header */}
      <Box py="xs" px="md" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)', backgroundColor: '#fff', zIndex: 20 }}>
        <Group justify="space-between">
          <Group>
            <ActionIcon variant="subtle" color="gray" onClick={() => navigate(`/note/${noteId}`)}>
              <IconChevronLeft size={20} />
            </ActionIcon>
            {note?.subject && (
              <Group gap="xs" ml="xs">
                {note.subject.group && (
                  <>
                    <Text size="sm" fw={500} c="dimmed" className="clickable-crumb" onClick={() => navigate(`/group/${note.subject.group.id}`)}>{note.subject.group.name}</Text>
                    <Text size="sm" c="dimmed">/</Text>
                  </>
                )}
                <Text size="sm" fw={500} c="dimmed" className="clickable-crumb" onClick={() => navigate(`/subject/${note.subject.id}`)}>{note.subject.name}</Text>
                <Text size="sm" c="dimmed">/</Text>
                <Text size="sm" fw={500} c="dimmed" className="clickable-crumb" onClick={() => navigate(`/note/${noteId}`)}>{note.title || 'Note'}</Text>
                <Text size="sm" c="dimmed">/</Text>
                <Text size="sm" fw={500} c="dimmed">Summary</Text>
              </Group>
            )}
          </Group>
        </Group>
      </Box>

      <Box style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <ScrollArea 
          viewportRef={viewportRef}
          onScrollPositionChange={handleScroll}
          style={{ flex: 1, backgroundColor: '#fff' }} 
          p={0}
        >
          <Container size="md" p={0} pt={0} pb="xl">
            {generating && summaryId === generatingSummaryId ? (
              <Box mt={100} ta="center">
                {isFailed ? (
                  <>
                    <IconAlertCircle size={64} color="var(--mantine-color-red-6)" stroke={1.5} />
                    <Title order={2} mt="xl" mb="sm" fw={800} c="red">Processing Failed</Title>
                    <Text c="dimmed" mb="xl" size="lg" maw={500} mx="auto">
                      {taskStatus?.error || 'An unexpected error occurred while generating the summary.'}
                    </Text>
                  </>
                ) : (
                  <>
                    <IconRobot size={64} color="var(--mantine-color-blue-6)" stroke={1.5} style={{ opacity: 0.8 }} />
                    <Title order={2} mt="xl" mb="sm" fw={800} c="#171738">Generating Summary...</Title>
                    <Text c="dimmed" mb="xl" size="lg" maw={500} mx="auto">
                      Our AI is analyzing the notes and generating your customized summary.
                    </Text>
                    <Box maw={400} mx="auto">
                      <Progress value={processingProgress} animated striped color="blue" size="xl" radius="xl" />
                      <Text size="sm" c="dimmed" mt="xs" ta="right">{processingProgress}%</Text>
                    </Box>
                  </>
                )}
              </Box>
            ) : loading ? (
              <Center h="50vh"><Loader size="lg" /></Center>
            ) : error ? (
              <Center h="50vh">
                <Stack align="center">
                  <IconAlertCircle size={48} color="red" />
                  <Text c="red">{error}</Text>
                </Stack>
              </Center>
            ) : summaries.length === 0 ? (
              <Center h="50vh">
                <Stack align="center">
                  <IconFileText size={64} color="var(--mantine-color-gray-3)" />
                  <Title order={3} c="dimmed">No Summaries Yet</Title>
                  <Text c="dimmed">Generate a summary to get started.</Text>
                  <Button mt="md" onClick={() => setModalOpened(true)} loading={generating}>Generate First Summary</Button>
                </Stack>
              </Center>
            ) : (
              <Box px="md">
                {/* Pills are now rendered inside the ReactMarkdown's first h1 via the custom components prop */}
                <Box ref={markdownRef} className="sticky-markdown" style={{ color: '#171738', fontSize: '16px', lineHeight: 1.8 }}>
                  {!summaryContent?.includes('# ') && selectedSummary && (
                    <Group gap="xs" mb="xl">
                      {selectedSummary.prompt_name ? (() => {
                        const IconComp = getIconComponent(selectedSummary.prompt_icon);
                        return (
                          <Badge leftSection={<IconComp size={12} />} variant="light" color="indigo" size="md" tt="capitalize" fw={600}>
                            {selectedSummary.prompt_name}
                          </Badge>
                        );
                      })() : (
                        <>
                          {selectedSummary.mode && (
                            <Badge leftSection={MODE_ICONS[selectedSummary.mode] || <IconBrain size={12} />} variant="light" color="blue" size="md" tt="capitalize" fw={600}>
                              {selectedSummary.mode}
                            </Badge>
                          )}
                          {selectedSummary.output_format && (
                            <Badge leftSection={FORMAT_ICONS[selectedSummary.output_format] || <IconFileText size={12} />} variant="light" color="teal" size="md" tt="capitalize" fw={600}>
                              {selectedSummary.output_format}
                            </Badge>
                          )}
                          {selectedSummary.processing_method && (
                            <Badge leftSection={METHOD_ICONS[selectedSummary.processing_method] || <IconCpu size={12} />} variant="light" color="grape" size="md" tt="capitalize" fw={600}>
                              {selectedSummary.processing_method}
                            </Badge>
                          )}
                        </>
                      )}
                    </Group>
                  )}
                  {(() => {
                    if (firstH1Ref.current.id !== selectedSummary?.id) {
                       firstH1Ref.current = { id: selectedSummary?.id, offset: null };
                    }
                    return (
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={{
                          h1: ({node, ...props}) => {
                            // Render pills for the first h1 we find.
                            // We use a ref to track the offset of the first H1 to avoid StrictMode double-render bugs
                            if (firstH1Ref.current.offset === null && node.position) {
                               firstH1Ref.current.offset = node.position.start.offset;
                            }
                            
                            const isFirstH1 = !node.position || node.position.start.offset === firstH1Ref.current.offset;
                            
                            console.log("H1 Node:", {
                              text: node.children?.[0]?.value,
                              position: node.position,
                              trackedOffset: firstH1Ref.current.offset,
                              isFirstH1
                            });
                            
                            if (isFirstH1 && selectedSummary) {
                              return (
                                <div className="summary-header" style={{ marginBottom: '1.5rem', paddingTop: '1rem' }}>
                                  <Group gap="xs" mb="md">
                                    {selectedSummary.prompt_name ? (() => {
                                      const IconComp = getIconComponent(selectedSummary.prompt_icon);
                                      return (
                                        <Badge leftSection={<IconComp size={12} />} variant="light" color="indigo" size="md" tt="capitalize" fw={600}>
                                          {selectedSummary.prompt_name}
                                        </Badge>
                                      );
                                    })() : (
                                      <>
                                        {selectedSummary.mode && (
                                          <Badge leftSection={MODE_ICONS[selectedSummary.mode] || <IconBrain size={12} />} variant="light" color="blue" size="md" tt="capitalize" fw={600}>
                                            {selectedSummary.mode}
                                          </Badge>
                                        )}
                                        {selectedSummary.output_format && (
                                          <Badge leftSection={FORMAT_ICONS[selectedSummary.output_format] || <IconFileText size={12} />} variant="light" color="teal" size="md" tt="capitalize" fw={600}>
                                            {selectedSummary.output_format}
                                          </Badge>
                                        )}
                                        {selectedSummary.processing_method && (
                                          <Badge leftSection={METHOD_ICONS[selectedSummary.processing_method] || <IconCpu size={12} />} variant="light" color="grape" size="md" tt="capitalize" fw={600}>
                                            {selectedSummary.processing_method}
                                          </Badge>
                                        )}
                                      </>
                                    )}
                                  </Group>
                                  <h1 {...props} style={{ marginTop: 0, marginBottom: 0 }} />
                                </div>
                              );
                            }
                            return <h1 {...props} />;
                          }
                        }}
                      >
                        {summaryContent}
                      </ReactMarkdown>
                    );
                  })()}
                </Box>
              </Box>
            )}
          </Container>
        </ScrollArea>

        {/* Right Sidebar */}
        <Box w={sidebarOpen ? 280 : 80} style={{ borderLeft: '1px solid #eaeaea', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', transition: 'width 0.2s ease' }} p="md">
          <Box style={{ flex: 1, overflowY: 'auto' }}>
            <Stack gap={0} align="stretch">
              {sidebarOpen && <Title order={5} fw={600} c="dimmed" mb="xs">Smart Actions</Title>}

              <Tooltip label="Generate New Summary" disabled={sidebarOpen} position="left">
                <MantineNavLink
                  label={sidebarOpen ? "Generate New" : ""}
                  leftSection={<IconSparkles size="1.2rem" stroke={1.5} />}
                  onClick={() => setModalOpened(true)}
                  disabled={generating}
                />
              </Tooltip>

              <Tooltip label="Back to Note" disabled={sidebarOpen} position="left">
                <MantineNavLink
                  label={sidebarOpen ? "Back to Note" : ""}
                  leftSection={<IconFileText size="1.2rem" stroke={1.5} />}
                  onClick={() => navigate(`/note/${noteId}`)}
                />
              </Tooltip>

              {sidebarOpen && <Title order={5} fw={600} c="dimmed" mt="xl" mb="md">Versions</Title>}
              
              {sidebarOpen ? (
                <Stack gap="xs">
                  {summaries.map(summary => {
                    const isActive = (selectedSummary?.id === summary.id) || (generating && summary.id === generatingSummaryId && summaryId === generatingSummaryId);
                    const details = summary.prompt_name || [summary.mode, summary.output_format, summary.processing_method].filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' • ');
                    const title = details || `Version ${summary.version}`;

                    return (
                    <Paper 
                      key={summary.id} 
                      p="sm" 
                      withBorder 
                      style={{ 
                        cursor: 'pointer', 
                        borderColor: isActive ? 'var(--mantine-color-blue-5)' : 'var(--mantine-color-gray-3)',
                        backgroundColor: isActive ? 'var(--mantine-color-blue-0)' : '#fff'
                      }}
                      onClick={() => loadSummaryContent(summary.id)}
                    >
                      <Group justify="space-between" wrap="nowrap">
                        <Text size="sm" fw={isActive ? 700 : 500} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {summary.is_pinned && <TablerIcons.IconPinFilled size={14} style={{ marginRight: 4, color: 'var(--mantine-color-blue-6)', verticalAlign: 'middle' }} />}
                          {summary.is_user_edited ? summary.title : title}
                        </Text>
                        {summary.id !== 'generating' && (
                          <div onClick={(e) => e.stopPropagation()}>
                            <Menu shadow="md" width={150} position="bottom-end" withinPortal>
                              <Menu.Target>
                                <ActionIcon variant="subtle" color="gray" size="sm">
                                  <TablerIcons.IconDotsVertical size={16} />
                                </ActionIcon>
                              </Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Item leftSection={<TablerIcons.IconPencil size={14} />} onClick={(e) => handleRename(summary, e)}>
                                Rename
                              </Menu.Item>
                              <Menu.Item leftSection={<TablerIcons.IconPin size={14} />} onClick={(e) => handlePin(summary, e)}>
                                {summary.is_pinned ? 'Unpin' : 'Pin'}
                              </Menu.Item>
                              <Menu.Item leftSection={<TablerIcons.IconInfoCircle size={14} />} onClick={(e) => { e.stopPropagation(); setInfoModalSummary(summary); }}>
                                System Info
                              </Menu.Item>
                              <Menu.Item color="red" leftSection={<TablerIcons.IconTrash size={14} />} onClick={(e) => handleDelete(summary, e)}>
                                Delete
                              </Menu.Item>
                            </Menu.Dropdown>
                            </Menu>
                          </div>
                        )}
                      </Group>
                      <Text size="xs" c="dimmed" mt={4}>
                        {formatDate(summary.created_at)}
                      </Text>
                    </Paper>
                    );
                  })}
                </Stack>
              ) : (
                <Stack gap="xs" align="center" mt="md">
                  {summaries.map(summary => {
                    const isActive = (selectedSummary?.id === summary.id) || (generating && summary.id === generatingSummaryId && summaryId === generatingSummaryId);
                    const details = summary.prompt_name || [summary.mode, summary.output_format, summary.processing_method].filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' • ');
                    const tooltipLabel = `${details || `Version ${summary.version}`} (${formatDate(summary.created_at)})`;

                    return (
                    <Tooltip key={summary.id} label={tooltipLabel} position="left">
                      <ActionIcon 
                        variant={isActive ? "light" : "subtle"}
                        color={isActive ? "blue" : "gray"}
                        onClick={() => loadSummaryContent(summary.id)}
                      >
                        <Text size="xs" fw={700}>v{summary.version}</Text>
                      </ActionIcon>
                    </Tooltip>
                    );
                  })}
                </Stack>
              )}
            </Stack>
          </Box>

          <Box mt="auto" pt="sm">
            <Tooltip label={sidebarOpen ? "Hide Sidebar" : "Show Sidebar"} position="left">
              <ActionIcon variant="subtle" color="gray" size="lg" onClick={toggleSidebar}>
                {sidebarOpen ? <IconLayoutSidebarRightCollapse size={20} /> : <IconLayoutSidebarRightExpand size={20} />}
              </ActionIcon>
            </Tooltip>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
