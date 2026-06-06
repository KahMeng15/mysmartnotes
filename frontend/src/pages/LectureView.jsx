import { useState, useEffect } from 'react';
import { Box, Container, Title, Textarea, Group, Button, Badge, Center, Loader, Text, ActionIcon, ScrollArea, Progress, Drawer } from '@mantine/core';
import { IconDeviceFloppy, IconRobot, IconCards, IconChevronLeft, IconPencil, IconX, IconMessageChatbot, IconFileText, IconAlertCircle } from '@tabler/icons-react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchApi } from '../lib/api';

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
      {/* Sticky Header */}
      <Box p="md" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)', backgroundColor: '#fff', zIndex: 10 }}>
        <Group justify="space-between">
          <Group>
            <ActionIcon variant="subtle" color="gray" onClick={() => navigate(-1)}>
              <IconChevronLeft size={20} />
            </ActionIcon>
            <Box>
              <Title order={3} fw={700} style={{ fontFamily: 'Instrument Sans, sans-serif', color: '#171738' }}>
                {lecture.title}
              </Title>
              <Text size="xs" c="dimmed">Note ID: {lecture.id}</Text>
            </Box>
            <Badge ml="md" color={isFailed ? 'red' : isProcessed ? 'teal' : 'orange'} variant="light">
              {isFailed ? 'Failed' : isProcessed ? 'Processed' : 'Processing...'}
            </Badge>
          </Group>
          
          <Group gap="sm">
            {isProcessed && (
              <>
                <Button variant="light" color="indigo" leftSection={<IconFileText size={16} />} onClick={() => navigate(`/summaries?lecture_id=${id}`)}>
                  See Summaries
                </Button>
                <Button variant="light" color="blue" leftSection={<IconMessageChatbot size={16} />} onClick={() => setChatOpened(true)}>
                  Quick Chat
                </Button>
                <Button variant="light" color="pink" leftSection={<IconCards size={16} />} onClick={() => navigate(`/quiz?lecture_id=${id}`)}>
                  Generate Quiz
                </Button>
              </>
            )}

            {isProcessed && !isEditing && (
              <Button leftSection={<IconPencil size={16} />} variant="default" onClick={() => setIsEditing(true)}>
                Edit Content
              </Button>
            )}
            {isEditing && (
              <Group>
                <Button variant="subtle" color="gray" leftSection={<IconX size={16} />} onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
                <Button leftSection={<IconDeviceFloppy size={16} />} onClick={handleSave} loading={saving}>
                  Save Changes
                </Button>
              </Group>
            )}
          </Group>
        </Group>
      </Box>

      {/* Content Area */}
      <ScrollArea style={{ flex: 1, backgroundColor: isEditing ? '#f8f9fa' : '#fff' }} p="xl">
        <Container size="md">
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
            <Box className="markdown-content" style={{ color: '#171738', fontSize: '16px', lineHeight: 1.8 }}>
              {content ? (
                <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>
              ) : (
                <Center h={200}><Text c="dimmed">No content extracted.</Text></Center>
              )}
            </Box>
          )}
        </Container>
      </ScrollArea>

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
