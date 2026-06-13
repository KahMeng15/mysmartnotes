import React, { useState, useEffect, useRef } from 'react';
import { Box, Container, Title, Text, Button, Center, Loader, Select, ScrollArea, Group, ActionIcon, Stack, Paper, Modal, Progress, Badge, Tooltip, NavLink as MantineNavLink, SegmentedControl, Textarea, TextInput, Menu, Code } from '@mantine/core';
import { IconRobot, IconAlertCircle, IconFileText, IconCheck, IconChevronLeft, IconLayoutSidebarRightCollapse, IconLayoutSidebarRightExpand, IconSparkles, IconBolt, IconWand, IconBrain, IconSchool, IconBabyCarriage, IconList, IconListNumbers, IconTable, IconFile, IconLayersLinked, IconBinaryTree, IconCpu, IconDeviceFloppy, IconPencil, IconX, IconH1, IconH2, IconH3, IconCode, IconEye } from '@tabler/icons-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
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

  const [isEditing, setIsEditing] = useState(false);
  const [isRawMode, setIsRawMode] = useState(false);
  const [saveModalOpened, setSaveModalOpened] = useState(false);
  const [cancelModalOpened, setCancelModalOpened] = useState(false);
  const [saving, setSaving] = useState(false);

  const viewportRef = useRef(null);
  const markdownRef = useRef(null);
  const textareaRef = useRef(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Markdown,
    ],
    content: summaryContent,
  });

  const [mode, setMode] = useState('normal');
  const [outputFormat, setOutputFormat] = useState('sentence');
  const [processingMethod, setProcessingMethod] = useState('whole');
  
  const [parameterType, setParameterType] = useState('multi'); // 'multi' or 'single'
  const [globalPrompts, setGlobalPrompts] = useState([]);
  const [selectedPromptId, setSelectedPromptId] = useState(null);
  const [userPrompts, setUserPrompts] = useState([]);
  const [createPromptModalOpened, setCreatePromptModalOpened] = useState(false);
  const [newPromptName, setNewPromptName] = useState('');
  const [newPromptContent, setNewPromptContent] = useState('');
  const [newPromptInput, setNewPromptInput] = useState('');
  const [generatingNewPrompt, setGeneratingNewPrompt] = useState(false);

  useEffect(() => {
    fetchApi('/admin/global-prompts').then(data => {
      setGlobalPrompts(data || []);
    }).catch(err => console.error("Failed to load global prompts", err));
    fetchApi('/prompts').then(data => {
      setUserPrompts(data || []);
    }).catch(err => console.error("Failed to load user prompts", err));
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
    Promise.all([
      fetchApi(`/summaries?note_id=${noteId}`),
      fetchApi('/search/tasks/active').catch(() => null)
    ]).then(([summariesData, activeData]) => {
      let activeTask = null;
      let genId = null;

      if (activeData && activeData.tasks) {
        activeTask = activeData.tasks.find(t => {
          const data = t.input_data?.kwargs || t.input_data || {};
          return t.task_type === 'summary_generation' && String(data.note_id) === String(noteId) && ['pending', 'processing', 'running'].includes(t.status);
        });
        
        if (activeTask) {
          const data = activeTask.input_data?.kwargs || activeTask.input_data || {};
          genId = data.summary_id || 'generating';
          setCurrentTaskId(activeTask.task_id);
          setGenerating(true);
          setGeneratingSummaryId(genId);
          setTaskStatus(activeTask);
        }
      }

      loadSummaries(false, false, summariesData, activeTask, genId);
    }).catch(err => {
      console.error("Failed to load initial data", err);
      setLoading(false);
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
             loadSummaries(true, true);
          } else {
             loadSummaries(false, true);
          }
        }
      }
    } catch (e) {
      console.error("Failed to fetch task status", e);
    }
  };

  const loadSummaries = async (selectNewest = false, forceNotGenerating = false, preloadedData = null, activeTask = null, preloadedGenId = null) => {
    try {
      setLoading(true);
      const data = preloadedData || await fetchApi(`/summaries?note_id=${noteId}`);
      const filtered = data.filter(d => d.summary_type === 'summary').sort((a, b) => b.version - a.version);
      
      let finalSummaries = [...filtered];
      const effectiveGenId = forceNotGenerating ? null : (preloadedGenId || generatingSummaryId);

      // If we have an active task injected, create the mock version
      if (activeTask && effectiveGenId) {
        const tdata = activeTask.input_data?.kwargs || activeTask.input_data || {};
        if (!finalSummaries.some(s => s.id === effectiveGenId)) {
           const mockVersion = {
             id: effectiveGenId,
             version: finalSummaries.length > 0 ? finalSummaries[0].version + 1 : 1,
             created_at: activeTask.created_at || new Date().toISOString(),
             mode: tdata.mode || 'Generating...',
             output_format: tdata.output_format || '',
             processing_method: tdata.processing_method || '',
             prompt_name: tdata.prompt_name,
             prompt_icon: tdata.prompt_icon
           };
           finalSummaries = [mockVersion, ...finalSummaries];
        }
      }

      setSummaries(prev => {
        const isGenerating = forceNotGenerating ? false : (generating || activeTask);
        if (isGenerating && !selectNewest && !activeTask) {
           const existing = prev.find(s => s.id === effectiveGenId);
           return [existing, ...filtered].filter(Boolean);
        }
        return finalSummaries;
      });

      if (finalSummaries.length > 0) {
        if (selectNewest === true) {
          loadSummaryContent(finalSummaries[0].id, forceNotGenerating);
        } else if (summaryId && summaryId !== effectiveGenId) {
          const target = finalSummaries.find(s => s.id === summaryId);
          if (target) {
            loadSummaryContent(target.id, forceNotGenerating);
          } else {
            loadSummaryContent(finalSummaries[0].id, forceNotGenerating);
          }
        } else if (summaryId !== effectiveGenId) {
          loadSummaryContent(finalSummaries[0].id, forceNotGenerating);
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

  const loadSummaryContent = async (id, forceNotGenerating = false) => {
    const isStillGenerating = forceNotGenerating ? false : (generating && id === generatingSummaryId);
    if (isStillGenerating) {
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

  const handleGenerateNewPromptAI = async () => {
    if (!newPromptInput.trim()) return;
    try {
      setGeneratingNewPrompt(true);
      const res = await fetchApi('/summaries/generate-prompt', {
        method: 'POST',
        body: JSON.stringify({ user_input: newPromptInput })
      });
      if (res && res.prompt) {
        setNewPromptContent(res.prompt);
        if (res.name) {
          setNewPromptName(res.name);
        }
      }
    } catch (err) {
      console.error("Failed to generate prompt", err);
    } finally {
      setGeneratingNewPrompt(false);
    }
  };

  const saveNewPrompt = async () => {
    if (!newPromptName.trim() || !newPromptContent.trim()) return;
    try {
      const res = await fetchApi('/prompts', {
        method: 'POST',
        body: JSON.stringify({ name: newPromptName, content: newPromptContent })
      });
      if (res && res.id) {
        setUserPrompts(prev => [...prev, res]);
        setSelectedPromptId(`u_${res.id}`);
        setCreatePromptModalOpened(false);
        setModalOpened(true);
        setNewPromptName('');
        setNewPromptContent('');
        setNewPromptInput('');
      }
    } catch (err) {
      console.error("Failed to save new prompt", err);
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
        if (!selectedPromptId) {
          setError("Please select a prompt template first");
          setGenerating(false);
          return;
        }
        if (selectedPromptId.startsWith('g_')) {
          const id = selectedPromptId.replace('g_', '');
          const gp = globalPrompts.find(p => p.id.toString() === id);
          if (gp) {
            finalPrompt = gp.content;
            finalPromptName = gp.name;
            finalPromptIcon = gp.icon;
          }
        } else if (selectedPromptId.startsWith('u_')) {
          const id = selectedPromptId.replace('u_', '');
          const up = userPrompts.find(p => p.id.toString() === id);
          if (up) {
            finalPrompt = up.content;
            finalPromptName = up.name;
            finalPromptIcon = 'IconUserEdit';
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
  }, [summaryContent, isEditing, isRawMode]);

  const startEditing = () => {
    if (editor) {
      editor.commands.setContent(summaryContent || '');
    }
    setIsEditing(true);
    setIsRawMode(false);
  };

  const handleToggleRaw = () => {
    if (isRawMode) {
      editor?.commands.setContent(summaryContent || '');
      setIsRawMode(false);
    } else {
      if (editor) {
        setSummaryContent(editor.storage.markdown.getMarkdown());
      }
      setIsRawMode(true);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    let finalContent = summaryContent;
    if (!isRawMode && editor) {
      finalContent = editor.storage.markdown.getMarkdown();
    }

    try {
      await fetchApi(`/summaries/${selectedSummary.id}`, {
        method: 'PUT',
        body: JSON.stringify({ content: finalContent })
      });
      setIsEditing(false);
      setIsRawMode(false);
      setSummaryContent(finalContent);
      setSummaries(summaries.map(s => s.id === selectedSummary.id ? { ...s, content: finalContent, is_user_edited: true } : s));
      setSelectedSummary({ ...selectedSummary, content: finalContent, is_user_edited: true });
    } catch (err) {
      console.error("Failed to save", err);
    } finally {
      setSaving(false);
    }
  };

  const handleFormat = (type) => {
    if (!isRawMode) {
      if (!editor) return;
      switch(type) {
        case 'h1': editor.chain().focus().toggleHeading({ level: 1 }).run(); break;
        case 'h2': editor.chain().focus().toggleHeading({ level: 2 }).run(); break;
        case 'h3': editor.chain().focus().toggleHeading({ level: 3 }).run(); break;
        case 'bullet': editor.chain().focus().toggleBulletList().run(); break;
        case 'ordered': editor.chain().focus().toggleOrderedList().run(); break;
        case 'table': editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); break;
      }
    } else {
      if (!textareaRef.current) return;
      const el = textareaRef.current;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const before = summaryContent.substring(0, start);
      const selected = summaryContent.substring(start, end);
      const after = summaryContent.substring(end);

      let inserted = '';
      switch(type) {
        case 'h1': inserted = '# ' + selected; break;
        case 'h2': inserted = '## ' + selected; break;
        case 'h3': inserted = '### ' + selected; break;
        case 'bullet': inserted = '- ' + selected; break;
        case 'ordered': inserted = '1. ' + selected; break;
        case 'table': inserted = `\n| Column 1 | Column 2 | Column 3 |\n| -------- | -------- | -------- |\n| Cell 1   | Cell 2   | Cell 3   |\n| Cell 4   | Cell 5   | Cell 6   |\n`; break;
      }

      const newContent = before + inserted + after;
      setSummaryContent(newContent);
      
      setTimeout(() => {
        el.focus();
        if (type !== 'table') {
           el.setSelectionRange(start, start + inserted.length);
        } else {
           el.setSelectionRange(start + inserted.length, start + inserted.length);
        }
      }, 0);
    }
  };

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
        .sticky-markdown .ProseMirror {
          min-height: 50vh;
        }
        .sticky-markdown .ProseMirror:focus {
          outline: none;
        }
      `}</style>
      
      <Modal opened={saveModalOpened} onClose={() => setSaveModalOpened(false)} title="Save Changes" centered withCloseButton={false}>
        <form onSubmit={(e) => { e.preventDefault(); setSaveModalOpened(false); handleSave(); }}>
          <Text size="sm" mb="md">Are you sure you want to save these changes?</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setSaveModalOpened(false)}>Cancel</Button>
            <Button type="submit" color="blue" data-autofocus loading={saving}>Confirm Save</Button>
          </Group>
        </form>
      </Modal>

      <Modal opened={cancelModalOpened} onClose={() => setCancelModalOpened(false)} title="Cancel Editing" centered withCloseButton={false}>
        <form onSubmit={(e) => { e.preventDefault(); setCancelModalOpened(false); setIsEditing(false); setIsRawMode(false); }}>
          <Text size="sm" mb="md">Are you sure you want to cancel? Any unsaved changes will be lost.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setCancelModalOpened(false)}>Go Back</Button>
            <Button type="submit" color="red" data-autofocus>Discard Changes</Button>
          </Group>
        </form>
      </Modal>

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

      <Modal opened={createPromptModalOpened} onClose={() => {
        setCreatePromptModalOpened(false);
        setModalOpened(true);
      }} title="Create New Prompt Template" centered size="lg">
        <Stack gap="md">
          <TextInput
            label="Template Name"
            placeholder="e.g. My Detailed Analysis"
            value={newPromptName}
            onChange={(e) => setNewPromptName(e.currentTarget.value)}
            required
            data-autofocus
          />
          <Textarea
            label="Custom Prompt"
            placeholder="Enter your prompt here..."
            value={newPromptContent}
            onChange={(e) => setNewPromptContent(e.currentTarget.value)}
            minRows={6}
            autosize
            maxRows={15}
            required
          />
          <Paper withBorder p="sm" radius="md">
            <Stack gap="xs">
              <Text size="sm" fw={500}>Or generate a prompt with AI:</Text>
              <Group gap="sm" align="flex-end">
                <Textarea
                  placeholder="E.g. generate a summary emphasizing key dates"
                  value={newPromptInput}
                  onChange={(e) => setNewPromptInput(e.currentTarget.value)}
                  style={{ flex: 1 }}
                  minRows={2}
                  autosize
                  maxRows={5}
                />
                <Button
                  variant="light"
                  onClick={handleGenerateNewPromptAI}
                  loading={generatingNewPrompt}
                  leftSection={<IconSparkles size={16} />}
                >
                  Generate
                </Button>
              </Group>
            </Stack>
          </Paper>
          <Group justify="space-between" mt="md">
            <Button variant="subtle" onClick={() => {
              setCreatePromptModalOpened(false);
              navigate('/settings');
            }}>Manage Prompts in Settings</Button>
            <Group>
              <Button variant="default" onClick={() => {
                setCreatePromptModalOpened(false);
                setModalOpened(true);
              }}>Cancel</Button>
              <Button onClick={saveNewPrompt} disabled={!newPromptName.trim() || !newPromptContent.trim()}>Save Template</Button>
            </Group>
          </Group>
        </Stack>
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
                placeholder="Select a template..."
                data={[
                  {
                    group: 'Global Templates',
                    items: globalPrompts.map(p => ({ value: `g_${p.id}`, label: p.name, icon: p.icon }))
                  },
                  {
                    group: 'Your Templates',
                    items: userPrompts.map(p => ({ value: `u_${p.id}`, label: p.name, icon: 'IconUserEdit' }))
                  },
                  {
                    group: 'Actions',
                    items: [
                      { value: 'create', label: 'Create a new template...', icon: 'IconPlus' }
                    ]
                  }
                ]}
                value={selectedPromptId}
                onChange={(val) => {
                  if (val === 'create') {
                    setCreatePromptModalOpened(true);
                    setModalOpened(false);
                    setSelectedPromptId(null);
                  } else {
                    setSelectedPromptId(val);
                  }
                }}
                leftSection={(() => {
                  if (!selectedPromptId) return <IconFileText size={16} />;
                  if (selectedPromptId.startsWith('g_')) {
                    const id = selectedPromptId.replace('g_', '');
                    const gp = globalPrompts.find(p => p.id.toString() === id);
                    const IconComp = getIconComponent(gp?.icon);
                    return <IconComp size={16} />;
                  } else if (selectedPromptId.startsWith('u_')) {
                    const IconComp = getIconComponent('IconUserEdit');
                    return <IconComp size={16} />;
                  }
                  return <IconFileText size={16} />;
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
                <Box mb="md" pt="md">
                  <Group gap="xs">
                    {selectedSummary?.prompt_name ? (() => {
                      const IconComp = getIconComponent(selectedSummary.prompt_icon);
                      return (
                        <Badge leftSection={<IconComp size={12} />} variant="light" color="indigo" size="md" tt="capitalize" fw={600}>
                          {selectedSummary.prompt_name}
                        </Badge>
                      );
                    })() : (
                      <>
                        {selectedSummary?.mode && (
                          <Badge leftSection={MODE_ICONS[selectedSummary.mode] || <IconBrain size={12} />} variant="light" color="blue" size="md" tt="capitalize" fw={600}>
                            {selectedSummary.mode}
                          </Badge>
                        )}
                        {selectedSummary?.output_format && (
                          <Badge leftSection={FORMAT_ICONS[selectedSummary.output_format] || <IconFileText size={12} />} variant="light" color="teal" size="md" tt="capitalize" fw={600}>
                            {selectedSummary.output_format}
                          </Badge>
                        )}
                        {selectedSummary?.processing_method && (
                          <Badge leftSection={METHOD_ICONS[selectedSummary.processing_method] || <IconCpu size={12} />} variant="light" color="grape" size="md" tt="capitalize" fw={600}>
                            {selectedSummary.processing_method}
                          </Badge>
                        )}
                      </>
                    )}
                  </Group>
                </Box>
                {isEditing && isRawMode ? (
                  <Textarea
                    ref={textareaRef}
                    minRows={30}
                    autosize
                    value={summaryContent}
                    onChange={(e) => setSummaryContent(e.currentTarget.value)}
                    variant="unstyled"
                    styles={{ input: { fontFamily: 'monospace', fontSize: '14px', lineHeight: 1.6 } }}
                  />
                ) : (
                <Box ref={markdownRef} className="sticky-markdown" style={{ color: '#171738', fontSize: '16px', lineHeight: 1.8 }}>
                  {isEditing && !isRawMode ? (
                    <EditorContent editor={editor} />
                  ) : (() => {
                    let displayContent = summaryContent || '';
                    let extractedTitle = selectedSummary?.title || 'Summary';
                    
                    const h1Regex = /^\s*#\s+(.+)$/m;
                    const match = displayContent.match(h1Regex);
                    if (match) {
                      extractedTitle = match[1].trim();
                      displayContent = displayContent.replace(h1Regex, '').trim();
                    }

                    return (
                      <>
                        <div className="summary-header" style={{ marginBottom: '1.5rem' }}>
                          <Title order={1} style={{ marginTop: 0, marginBottom: 0, color: '#171738', fontWeight: 700 }}>
                            {extractedTitle}
                          </Title>
                        </div>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {displayContent}
                        </ReactMarkdown>
                      </>
                    );
                  })()}
                </Box>
                )}
              </Box>
            )}
          </Container>
        </ScrollArea>

        {/* Right Sidebar */}
        <Box w={sidebarOpen ? 280 : 80} style={{ borderLeft: '1px solid #eaeaea', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', transition: 'width 0.2s ease' }} p="md">
          <Box style={{ flex: 1, overflowY: 'auto' }}>
            <Stack gap={0} align="stretch">
              {sidebarOpen && <Title order={5} fw={600} c="dimmed" mb="xs">Smart Actions</Title>}

              {!isEditing ? (
                <>
                  <Tooltip label="Edit Summary" disabled={sidebarOpen} position="left">
                    <MantineNavLink
                      label={sidebarOpen ? "Edit Summary" : ""}
                      leftSection={<IconPencil size="1.2rem" stroke={1.5} />}
                      onClick={startEditing}
                    />
                  </Tooltip>

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
                </>
              ) : (
                <>
                  {sidebarOpen && <Box mt="md" mb="xs" px="sm"><Text size="xs" fw={600} c="dimmed" tt="uppercase">Actions</Text></Box>}
                  <Tooltip label="Save Changes" disabled={sidebarOpen} position="left">
                    <MantineNavLink
                      label={sidebarOpen ? "Save Changes" : ""}
                      leftSection={<IconDeviceFloppy size="1.2rem" stroke={1.5} />}
                      onClick={() => setSaveModalOpened(true)}
                      color="blue"
                      variant="filled"
                      active
                    />
                  </Tooltip>
                  <Tooltip label="Cancel Editing" disabled={sidebarOpen} position="left">
                    <MantineNavLink
                      label={sidebarOpen ? "Cancel Editing" : ""}
                      leftSection={<IconX size="1.2rem" stroke={1.5} />}
                      onClick={() => setCancelModalOpened(true)}
                      color="red"
                    />
                  </Tooltip>

                  <Tooltip label={isRawMode ? "Visual Editor" : "Raw Markdown"} disabled={sidebarOpen} position="left">
                    <MantineNavLink
                      label={sidebarOpen ? (isRawMode ? "Visual Editor" : "Raw Markdown") : ""}
                      leftSection={isRawMode ? <IconEye size="1.2rem" stroke={1.5} /> : <IconCode size="1.2rem" stroke={1.5} />}
                      onClick={handleToggleRaw}
                    />
                  </Tooltip>

                  {(editor || isRawMode) && (
                    <>
                      {sidebarOpen && <Box mt="md" mb="xs" px="sm"><Text size="xs" fw={600} c="dimmed" tt="uppercase">Formatting</Text></Box>}
                      <Tooltip label="Heading 1" disabled={sidebarOpen} position="left">
                        <MantineNavLink
                          label={sidebarOpen ? "Heading 1" : ""}
                          leftSection={<IconH1 size="1.2rem" stroke={1.5} />}
                          onClick={() => handleFormat('h1')}
                          active={!isRawMode && editor?.isActive('heading', { level: 1 })}
                        />
                      </Tooltip>
                      <Tooltip label="Heading 2" disabled={sidebarOpen} position="left">
                        <MantineNavLink
                          label={sidebarOpen ? "Heading 2" : ""}
                          leftSection={<IconH2 size="1.2rem" stroke={1.5} />}
                          onClick={() => handleFormat('h2')}
                          active={!isRawMode && editor?.isActive('heading', { level: 2 })}
                        />
                      </Tooltip>
                      <Tooltip label="Heading 3" disabled={sidebarOpen} position="left">
                        <MantineNavLink
                          label={sidebarOpen ? "Heading 3" : ""}
                          leftSection={<IconH3 size="1.2rem" stroke={1.5} />}
                          onClick={() => handleFormat('h3')}
                          active={!isRawMode && editor?.isActive('heading', { level: 3 })}
                        />
                      </Tooltip>
                      <Tooltip label="Bullet List" disabled={sidebarOpen} position="left">
                        <MantineNavLink
                          label={sidebarOpen ? "Bullet List" : ""}
                          leftSection={<IconList size="1.2rem" stroke={1.5} />}
                          onClick={() => handleFormat('bullet')}
                          active={!isRawMode && editor?.isActive('bulletList')}
                        />
                      </Tooltip>
                      <Tooltip label="Numbered List" disabled={sidebarOpen} position="left">
                        <MantineNavLink
                          label={sidebarOpen ? "Numbered List" : ""}
                          leftSection={<IconListNumbers size="1.2rem" stroke={1.5} />}
                          onClick={() => handleFormat('ordered')}
                          active={!isRawMode && editor?.isActive('orderedList')}
                        />
                      </Tooltip>
                      <Tooltip label="Insert Table" disabled={sidebarOpen} position="left">
                        <MantineNavLink
                          label={sidebarOpen ? "Insert Table" : ""}
                          leftSection={<IconTable size="1.2rem" stroke={1.5} />}
                          onClick={() => handleFormat('table')}
                        />
                      </Tooltip>
                    </>
                  )}
                </>
              )}

              {!isEditing && (
                <>
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
                </>
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
