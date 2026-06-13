import { useState, useEffect, useRef } from 'react';
import { Box, Container, Title, Textarea, Group, Button, Badge, Center, Loader, Text, ActionIcon, ScrollArea, Progress, Drawer, Stack, Tooltip } from '@mantine/core';
import { IconDeviceFloppy, IconRobot, IconCards, IconChevronLeft, IconPencil, IconX, IconMessageChatbot, IconFileText, IconAlertCircle, IconLayoutSidebarRightCollapse, IconLayoutSidebarRightExpand } from '@tabler/icons-react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchApi } from '../lib/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function NoteView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [note, setNote] = useState(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [taskStatus, setTaskStatus] = useState(null);
  const [chatOpened, setChatOpened] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

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

  const viewportRef = useRef(null);
  const markdownRef = useRef(null);

  const handleScroll = () => {
    if (!viewportRef.current || !markdownRef.current) return;
    const viewportRect = viewportRef.current.getBoundingClientRect();
    const viewportTop = viewportRect.top;

    let currentAccumulatedTop = 0;

    for (let i = 1; i <= 6; i++) {
      const tag = `h${i}`;
      const elements = markdownRef.current.querySelectorAll(tag);
      let activeEl = null;

      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        if (rect.top <= viewportTop + currentAccumulatedTop + 5) {
          activeEl = el;
        }
      }

      let h = 0;
      if (activeEl) {
        h = activeEl.offsetHeight;
      } else if (elements.length > 0) {
        h = elements[0].offsetHeight;
      }

      currentAccumulatedTop += h;
      if (i < 6) {
        markdownRef.current.style.setProperty(`--h${i + 1}-top`, `${currentAccumulatedTop}px`);
      }
    }
  };

  useEffect(() => {
    setTimeout(handleScroll, 100);
  }, [content, isEditing]);

  useEffect(() => {
    const loadNote = async () => {
      try {
        const data = await fetchApi(`/notes/${id}?t=${Date.now()}`);
        setNote(data);
        setContent(data.extracted_text || '');
      } catch (err) {
        console.error("Failed to load note", err);
      } finally {
        setLoading(false);
      }
    };
    loadNote();
  }, [id]);

  useEffect(() => {
    if (!note) return;
    if (isProcessedCheck(note)) return;

    let interval;
    const pollTask = async () => {
      try {
        const statusData = await fetchApi(`/search/task?note_id=${id}`);
        setTaskStatus(statusData);

        if (statusData && statusData.status === 'completed') {
          // Task just finished, reload note with cache buster to get the fresh extracted_text
          const data = await fetchApi(`/notes/${id}?t=${Date.now()}`);
          setNote(data);
          setContent(data.extracted_text || '');
          clearInterval(interval);
        } else if (statusData && statusData.status === 'failed') {
          clearInterval(interval);
        }
      } catch (e) {
        console.error("Failed to poll task status", e);
      }
    };

    pollTask(); // Initial poll
    interval = setInterval(pollTask, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [id, note?.processing_time_ms, note?.extracted_text, note?.output_pdf_path]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetchApi(`/notes/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ extracted_text: content })
      });
      setIsEditing(false);
      setNote({ ...note, extracted_text: content });
    } catch (err) {
      console.error("Failed to save", err);
    } finally {
      setSaving(false);
    }
  };

  const isProcessedCheck = (lec) => {
    return lec.processing_time_ms != null || lec.extracted_text != null || lec.output_pdf_path != null;
  };

  if (loading && !note) {
    return <Center h="50vh"><Loader size="lg" /></Center>;
  }

  if (!note) {
    return <Center h="50vh"><Text c="dimmed">Note not found.</Text></Center>;
  }

  const isProcessed = isProcessedCheck(note) || (taskStatus?.status === 'completed');
  const isFailed = taskStatus?.status === 'failed';
  const processingProgress = taskStatus?.progress || 10;

  return (
    <Box h="100vh" style={{ display: 'flex', flexDirection: 'column' }}>
      <style>{`
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
          padding-top: 0.5rem;
          padding-bottom: 0.2rem;
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
        .sticky-markdown ul, .sticky-markdown ol { margin-bottom: 0.5rem; padding-left: 1.5rem; }
        .sticky-markdown li { margin-bottom: 0.2rem; }
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
      `}</style>

      {/* Sticky Header */}
      <Box p="md" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)', backgroundColor: '#fff', zIndex: 20 }}>
        <Group justify="space-between">
          <Group>
            <ActionIcon variant="subtle" color="gray" onClick={() => navigate(-1)}>
              <IconChevronLeft size={20} />
            </ActionIcon>
            {!isProcessed && (
              <Badge ml="md" color={isFailed ? 'red' : 'orange'} variant="light">
                {isFailed ? 'Failed' : 'Processing...'}
              </Badge>
            )}
          </Group>

          <Group gap="sm">
            {isProcessed && (
              <Tooltip label={sidebarOpen ? "Hide Sidebar" : "Show Sidebar"}>
                <ActionIcon variant="light" color="gray" size="lg" onClick={toggleSidebar}>
                  {sidebarOpen ? <IconLayoutSidebarRightCollapse size={20} /> : <IconLayoutSidebarRightExpand size={20} />}
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        </Group>
      </Box>

      {/* Main Area with Sidebar */}
      <Box style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Content Area */}
        <ScrollArea
          viewportRef={viewportRef}
          onScrollPositionChange={handleScroll}
          style={{ flex: 1, backgroundColor: isEditing ? '#f8f9fa' : '#fff' }}
          p="xs"
        >
          <Container size="md" py="xs">
            {isFailed ? (
              <Box mt={100} ta="center">
                <IconAlertCircle size={64} color="var(--mantine-color-red-6)" stroke={1.5} />
                <Title order={2} mt="xl" mb="sm" fw={800} c="red">Processing Failed</Title>
                <Text c="dimmed" mb="xl" size="lg" maw={500} mx="auto">
                  {taskStatus?.error || 'An unexpected error occurred while processing this document.'}
                </Text>
              </Box>
            ) : !isProcessed ? (
              <Box mt={100} ta="center">
                <IconRobot size={64} color="var(--mantine-color-blue-6)" stroke={1.5} style={{ opacity: 0.8 }} />
                <Title order={2} mt="xl" mb="sm" fw={800} c="#171738">Processing Document...</Title>
                <Text c="dimmed" mb="xl" size="lg" maw={500} mx="auto">
                  Our AI is currently extracting text, analyzing the content, and preparing your smart notes. This usually takes a few seconds.
                </Text>
                <Box maw={400} mx="auto">
                  <Progress value={processingProgress} animated striped color="blue" size="xl" radius="xl" />
                  <Text size="sm" c="dimmed" mt="xs" ta="right">{processingProgress}%</Text>
                </Box>
              </Box>
            ) : isEditing ? (
              <Textarea
                minRows={30}
                autosize
                value={content}
                onChange={(e) => setContent(e.currentTarget.value)}
                variant="unstyled"
                styles={{ input: { fontFamily: 'monospace', fontSize: '14px', lineHeight: 1.6 } }}
              />
            ) : (
              <Box ref={markdownRef} className="sticky-markdown" style={{ color: '#171738', fontSize: '16px', lineHeight: 1.8 }}>
                {content ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {content}
                  </ReactMarkdown>
                ) : (
                  <Center h={200}><Text c="dimmed">No content extracted.</Text></Center>
                )}
              </Box>
            )}
          </Container>
        </ScrollArea>

        {/* Right Sidebar */}
        {isProcessed && (
          <Box w={sidebarOpen ? 280 : 70} style={{ borderLeft: '1px solid #eaeaea', backgroundColor: '#fafafa', overflowY: 'auto', transition: 'width 0.2s ease' }} p={sidebarOpen ? "md" : "xs"}>
            <Stack gap="sm" align={sidebarOpen ? "stretch" : "center"}>
              {sidebarOpen && <Title order={5} fw={600} c="dimmed" mb="xs">Smart Actions</Title>}

              {!isEditing ? (
                <>
                  <Tooltip label="Edit Note" disabled={sidebarOpen} position="left">
                    <Button
                      variant="subtle"
                      color="gray"
                      fullWidth={sidebarOpen}
                      w={sidebarOpen ? '100%' : 40}
                      px={sidebarOpen ? 'sm' : 0}
                      leftSection={<IconPencil size={20} style={{ margin: sidebarOpen ? undefined : '0 auto' }} />}
                      onClick={() => setIsEditing(true)}
                      style={{ justifyContent: sidebarOpen ? 'flex-start' : 'center', padding: sidebarOpen ? undefined : 0 }}
                      styles={{ section: { margin: sidebarOpen ? undefined : 0 } }}
                    >
                      {sidebarOpen && "Edit Note"}
                    </Button>
                  </Tooltip>
                  <Tooltip label="See Summaries" disabled={sidebarOpen} position="left">
                    <Button
                      variant="subtle"
                      color="gray"
                      fullWidth={sidebarOpen}
                      w={sidebarOpen ? '100%' : 40}
                      px={sidebarOpen ? 'sm' : 0}
                      leftSection={<IconFileText size={20} style={{ margin: sidebarOpen ? undefined : '0 auto' }} />}
                      onClick={() => navigate(`/summaries?note_id=${id}`)}
                      style={{ justifyContent: sidebarOpen ? 'flex-start' : 'center', padding: sidebarOpen ? undefined : 0 }}
                      styles={{ section: { margin: sidebarOpen ? undefined : 0 } }}
                    >
                      {sidebarOpen && "See Summaries"}
                    </Button>
                  </Tooltip>
                  <Tooltip label="Quick Chat" disabled={sidebarOpen} position="left">
                    <Button
                      variant="subtle"
                      color="gray"
                      fullWidth={sidebarOpen}
                      w={sidebarOpen ? '100%' : 40}
                      px={sidebarOpen ? 'sm' : 0}
                      leftSection={<IconMessageChatbot size={20} style={{ margin: sidebarOpen ? undefined : '0 auto' }} />}
                      onClick={() => setChatOpened(true)}
                      style={{ justifyContent: sidebarOpen ? 'flex-start' : 'center', padding: sidebarOpen ? undefined : 0 }}
                      styles={{ section: { margin: sidebarOpen ? undefined : 0 } }}
                    >
                      {sidebarOpen && "Quick Chat"}
                    </Button>
                  </Tooltip>
                  <Tooltip label="Generate Quiz" disabled={sidebarOpen} position="left">
                    <Button
                      variant="subtle"
                      color="gray"
                      fullWidth={sidebarOpen}
                      w={sidebarOpen ? '100%' : 40}
                      px={sidebarOpen ? 'sm' : 0}
                      leftSection={<IconCards size={20} style={{ margin: sidebarOpen ? undefined : '0 auto' }} />}
                      onClick={() => navigate(`/quiz?note_id=${id}`)}
                      style={{ justifyContent: sidebarOpen ? 'flex-start' : 'center', padding: sidebarOpen ? undefined : 0 }}
                      styles={{ section: { margin: sidebarOpen ? undefined : 0 } }}
                    >
                      {sidebarOpen && "Generate Quiz"}
                    </Button>
                  </Tooltip>
                </>
              ) : (
                <>
                  <Tooltip label="Save Changes" disabled={sidebarOpen} position="left">
                    <Button
                      variant="filled"
                      color="blue"
                      fullWidth={sidebarOpen}
                      w={sidebarOpen ? '100%' : 40}
                      px={sidebarOpen ? 'sm' : 0}
                      leftSection={<IconDeviceFloppy size={20} style={{ margin: sidebarOpen ? undefined : '0 auto' }} />}
                      onClick={handleSave}
                      loading={saving}
                      style={{ justifyContent: sidebarOpen ? 'flex-start' : 'center', padding: sidebarOpen ? undefined : 0 }}
                      styles={{ section: { margin: sidebarOpen ? undefined : 0 } }}
                    >
                      {sidebarOpen && "Save Changes"}
                    </Button>
                  </Tooltip>
                  <Tooltip label="Cancel Editing" disabled={sidebarOpen} position="left">
                    <Button
                      variant="subtle"
                      color="gray"
                      fullWidth={sidebarOpen}
                      w={sidebarOpen ? '100%' : 40}
                      px={sidebarOpen ? 'sm' : 0}
                      leftSection={<IconX size={20} style={{ margin: sidebarOpen ? undefined : '0 auto' }} />}
                      onClick={() => setIsEditing(false)}
                      style={{ justifyContent: sidebarOpen ? 'flex-start' : 'center', padding: sidebarOpen ? undefined : 0 }}
                      styles={{ section: { margin: sidebarOpen ? undefined : 0 } }}
                    >
                      {sidebarOpen && "Cancel Editing"}
                    </Button>
                  </Tooltip>
                </>
              )}
            </Stack>
          </Box>
        )}
      </Box>

      {/* Quick Chat Drawer */}
      <Drawer
        opened={chatOpened}
        onClose={() => setChatOpened(false)}
        title="Quick Chat"
        position="right"
        size="md"
      >
        <Center h="70vh">
          <Text c="dimmed">Chat interface loading...</Text>
        </Center>
      </Drawer>
    </Box>
  );
}
