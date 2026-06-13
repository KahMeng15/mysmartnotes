import { useState, useEffect, useRef } from 'react';
import { Box, Container, Title, Text, Button, Center, Loader, Select, ScrollArea, Group, ActionIcon, Stack, Paper, Modal, Progress, Badge, Tooltip, NavLink as MantineNavLink } from '@mantine/core';
import { IconRobot, IconAlertCircle, IconFileText, IconCheck, IconChevronLeft, IconLayoutSidebarRightCollapse, IconLayoutSidebarRightExpand, IconSparkles, IconBolt, IconWand, IconBrain, IconSchool, IconBabyCarriage, IconList, IconListNumbers, IconTable, IconFile, IconLayersLinked, IconBinaryTree, IconCpu } from '@tabler/icons-react';

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
  chunked: <IconLayersLinked size={14} />,
  hierarchical: <IconBinaryTree size={14} />,
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
  const [modalOpened, setModalOpened] = useState(false);
  const [taskStatus, setTaskStatus] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const viewportRef = useRef(null);
  const markdownRef = useRef(null);

  const [mode, setMode] = useState('normal');
  const [outputFormat, setOutputFormat] = useState('sentence');
  const [processingMethod, setProcessingMethod] = useState('whole');

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
          const task = activeData.tasks.find(t => t.task_type === 'summary_generation' && String(t.note_id) === String(noteId));
          if (task) {
            setCurrentTaskId(task.task_id);
            setGenerating(true);
            setTaskStatus(task);
            setSummaries(prev => {
              if (!prev.some(s => s.id === 'generating')) {
                 const mockVersion = {
                   id: 'generating',
                   version: prev.length > 0 ? prev[0].version + 1 : 1,
                   created_at: task.created_at || new Date().toISOString(),
                   mode: 'Generating...',
                   output_format: '',
                   processing_method: '',
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
        const isGenerating = prev.some(s => s.id === 'generating');
        if (isGenerating && !selectNewest) {
           return [prev.find(s => s.id === 'generating'), ...filtered];
        }
        return filtered;
      });

      if (filtered.length > 0) {
        if (selectNewest === true) {
          loadSummaryContent(filtered[0].id);
        } else if (summaryId && summaryId !== 'generating') {
          const target = filtered.find(s => s.id === summaryId);
          if (target) {
            loadSummaryContent(target.id);
          } else {
            loadSummaryContent(filtered[0].id);
          }
        } else if (summaryId !== 'generating') {
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
    if (id === 'generating') {
      setSelectedSummary(null);
      navigate(`/note/${noteId}/summary/generating`, { replace: true });
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

  const startGenerateSummary = async () => {
    try {
      setGenerating(true);
      setModalOpened(false);
      setTaskStatus({ progress: 0, status: 'pending' });
      setSelectedSummary(null);
      
      const nextVersion = summaries.filter(s => s.id !== 'generating').length > 0 
        ? summaries.filter(s => s.id !== 'generating')[0].version + 1 
        : 1;

      const mockVersion = {
        id: 'generating',
        version: nextVersion,
        created_at: new Date().toISOString(),
        mode: mode,
        output_format: outputFormat,
        processing_method: processingMethod,
      };

      setSummaries(prev => [mockVersion, ...prev.filter(s => s.id !== 'generating')]);
      navigate(`/note/${noteId}/summary/generating`, { replace: true });
      
      const res = await fetchApi('/summaries/summary', {
        method: 'POST',
        body: JSON.stringify({
          note_id: noteId,
          mode: mode,
          output_format: outputFormat,
          processing_method: processingMethod
        })
      });
      if (res && res.task_id) {
         setCurrentTaskId(res.task_id);
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
          const rect = el.getBoundingClientRect();
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
          if (el === activeEl) {
            el.style.opacity = 1;
            el.style.pointerEvents = 'auto';
          } else if (el.getBoundingClientRect().top <= viewportTop + currentAccumulatedTop + 5) {
            el.style.opacity = 0;
            el.style.pointerEvents = 'none';
          } else {
            el.style.opacity = 1;
            el.style.pointerEvents = 'auto';
          }
        }

        let h = 0;
        if (activeEl) {
          h = activeEl.offsetHeight;
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
      <Modal opened={modalOpened} onClose={() => setModalOpened(false)} title="Summary Parameters" centered>
        <Stack>
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
          <Container size="md" p={0} py="xl">
            {summaryId === 'generating' ? (
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
                <Title order={1} fw={800} mb="xs" c="#171738" style={{ fontFamily: 'Instrument Sans, sans-serif' }}>
                  {selectedSummary ? selectedSummary.title.replace(/^Summary - /, '') : "Note Summaries"}
                </Title>
                {selectedSummary && (
                  <Group gap="xs" mb="xl">
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
                  </Group>
                )}
                <Box ref={markdownRef} className="sticky-markdown" style={{ color: '#171738', fontSize: '16px', lineHeight: 1.8 }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {summaryContent}
                  </ReactMarkdown>
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
                    const isActive = (selectedSummary?.id === summary.id) || (summaryId === 'generating' && summary.id === 'generating');
                    const details = [summary.mode, summary.output_format, summary.processing_method].filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' • ');
                    const title = summary.id === 'generating' ? 'Generating...' : (details || `Version ${summary.version}`);

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
                      <Group justify="space-between">
                        <Text size="sm" fw={isActive ? 700 : 500}>
                          {title}
                        </Text>
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
                    const isActive = (selectedSummary?.id === summary.id) || (summaryId === 'generating' && summary.id === 'generating');
                    const details = [summary.mode, summary.output_format, summary.processing_method].filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' • ');
                    const tooltipLabel = summary.id === 'generating' ? 'Generating...' : `${details || `Version ${summary.version}`} (${formatDate(summary.created_at)})`;

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
