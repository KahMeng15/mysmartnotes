import { useState, useEffect, useRef } from 'react';
import { Box, Container, Title, Textarea, Group, Button, Badge, Center, Loader, Text, ActionIcon, ScrollArea, Progress, Drawer, Stack, Tooltip } from '@mantine/core';
import { IconDeviceFloppy, IconRobot, IconCards, IconChevronLeft, IconPencil, IconX, IconMessageChatbot, IconFileText, IconAlertCircle, IconLayoutSidebarRightCollapse, IconLayoutSidebarRightExpand } from '@tabler/icons-react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchApi } from '../lib/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function LectureView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lecture, setLecture] = useState(null);
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
        markdownRef.current.style.setProperty(`--h${i+1}-top`, `${currentAccumulatedTop}px`);
      }
    }
  };

  useEffect(() => {
    setTimeout(handleScroll, 100);
  }, [content, isEditing]);

  useEffect(() => {
    const loadLecture = async () => {
      try {
        const data = await fetchApi(`/lectures/${id}?t=${Date.now()}`);
        setLecture(data);
        setContent(data.extracted_text || '');
      } catch (err) {
        console.error("Failed to load lecture", err);
      } finally {
        setLoading(false);
      }
    };
    loadLecture();
  }, [id]);

  useEffect(() => {
    if (!lecture) return;
    if (isProcessedCheck(lecture)) return;

    let interval;
    const pollTask = async () => {
      try {
        const statusData = await fetchApi(`/search/task?lecture_id=${id}`);
        setTaskStatus(statusData);

        if (statusData && statusData.status === 'completed') {
          // Task just finished, reload lecture with cache buster to get the fresh extracted_text
          const data = await fetchApi(`/lectures/${id}?t=${Date.now()}`);
          setLecture(data);
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
  }, [id, lecture?.processing_time_ms, lecture?.extracted_text, lecture?.output_pdf_path]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetchApi(`/lectures/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ extracted_text: content })
      });
      setIsEditing(false);
      setLecture({ ...lecture, extracted_text: content });
    } catch (err) {
      console.error("Failed to save", err);
    } finally {
      setSaving(false);
    }
  };

  const isProcessedCheck = (lec) => {
    return lec.processing_time_ms != null || lec.extracted_text != null || lec.output_pdf_path != null;
  };

  if (loading && !lecture) {
    return <Center h="50vh"><Loader size="lg" /></Center>;
  }

  if (!lecture) {
    return <Center h="50vh"><Text c="dimmed">Lecture not found.</Text></Center>;
  }

  const isProcessed = isProcessedCheck(lecture) || (taskStatus?.status === 'completed');
  const isFailed = taskStatus?.status === 'failed';
  const processingProgress = taskStatus?.progress || 10;

  return (
    <Box h="calc(100vh - 90px)" style={{ display: 'flex', flexDirection: 'column' }}>
      <style>{`
        .sticky-markdown {
          font-family: 'Instrument Sans', sans-serif;
          color: #171738;
          line-height: 1.8;
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
          padding-top: 1rem;
          padding-bottom: 0.5rem;
          z-index: 10;
          border-bottom: 1px solid #eaeaea;
        }
        .sticky-markdown h1 { top: 0; z-index: 16; font-size: 2.2rem; }
        .sticky-markdown h2 { top: var(--h2-top, 3.5rem); z-index: 15; font-size: 1.8rem; }
        .sticky-markdown h3 { top: var(--h3-top, 6.5rem); z-index: 14; font-size: 1.5rem; }
        .sticky-markdown h4 { top: var(--h4-top, 9rem); z-index: 13; font-size: 1.25rem; }
        .sticky-markdown h5 { top: var(--h5-top, 11rem); z-index: 12; font-size: 1.1rem; }
        .sticky-markdown h6 { top: var(--h6-top, 13rem); z-index: 11; font-size: 1rem; }
        .sticky-markdown p { margin-bottom: 1.2rem; }
        .sticky-markdown ul, .sticky-markdown ol { margin-bottom: 1.2rem; padding-left: 2rem; }
        .sticky-markdown li { margin-bottom: 0.5rem; }
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
          p="md"
        >
          <Container size="md" py="xl">
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
        {isProcessed && sidebarOpen && (
          <Box w={280} style={{ borderLeft: '1px solid #eaeaea', backgroundColor: '#fafafa', overflowY: 'auto' }} p="md">
            <Stack gap="md">
              <Title order={5} fw={600} c="dimmed">Smart Actions</Title>
              
              {!isEditing ? (
                <>
                  <Button 
                    variant="light" 
                    color="gray" 
                    fullWidth 
                    leftSection={<IconPencil size={18} />} 
                    onClick={() => setIsEditing(true)}
                    style={{ justifyContent: 'flex-start' }}
                  >
                    Edit Note
                  </Button>
                  <Button 
                    variant="light" 
                    color="indigo" 
                    fullWidth 
                    leftSection={<IconFileText size={18} />} 
                    onClick={() => navigate(`/summaries?lecture_id=${id}`)}
                    style={{ justifyContent: 'flex-start' }}
                  >
                    See Summaries
                  </Button>
                  <Button 
                    variant="light" 
                    color="blue" 
                    fullWidth 
                    leftSection={<IconMessageChatbot size={18} />} 
                    onClick={() => setChatOpened(true)}
                    style={{ justifyContent: 'flex-start' }}
                  >
                    Quick Chat
                  </Button>
                  <Button 
                    variant="light" 
                    color="pink" 
                    fullWidth 
                    leftSection={<IconCards size={18} />} 
                    onClick={() => navigate(`/quiz?lecture_id=${id}`)}
                    style={{ justifyContent: 'flex-start' }}
                  >
                    Generate Quiz
                  </Button>
                </>
              ) : (
                <>
                  <Button 
                    variant="filled" 
                    color="blue" 
                    fullWidth 
                    leftSection={<IconDeviceFloppy size={18} />} 
                    onClick={handleSave} 
                    loading={saving}
                    style={{ justifyContent: 'flex-start' }}
                  >
                    Save Changes
                  </Button>
                  <Button 
                    variant="light" 
                    color="gray" 
                    fullWidth 
                    leftSection={<IconX size={18} />} 
                    onClick={() => setIsEditing(false)}
                    style={{ justifyContent: 'flex-start' }}
                  >
                    Cancel Editing
                  </Button>
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
