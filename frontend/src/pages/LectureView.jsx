import { useState, useEffect } from 'react';
import { Box, Flex, Title, Tabs, Paper, Textarea, Group, Button, Badge, Center, Loader, Text, ActionIcon, ScrollArea, Divider } from '@mantine/core';
import { IconDeviceFloppy, IconRobot, IconCards, IconFileText, IconChevronLeft, IconPencil, IconX } from '@tabler/icons-react';
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

  useEffect(() => {
    const loadLecture = async () => {
      try {
        const data = await fetchApi(`/lectures/${id}`);
        setLecture(data);
        setContent(data.content || '');
      } catch (err) {
        console.error("Failed to load lecture", err);
      } finally {
        setLoading(false);
      }
    };
    loadLecture();
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetchApi(`/lectures/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ content })
      });
      setIsEditing(false);
      // Update local state to reflect new content in view mode
      setLecture({ ...lecture, content });
    } catch (err) {
      console.error("Failed to save", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Center h="50vh"><Loader size="lg" /></Center>;
  }

  if (!lecture) {
    return <Center h="50vh"><Text c="dimmed">Lecture not found.</Text></Center>;
  }

  return (
    <Flex h="calc(100vh - 90px)" gap="md">
      {/* Left Column: Note Content */}
      <Paper withBorder radius="md" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        
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
                <Text size="xs" c="dimmed">Subject › {lecture.title}</Text>
              </Box>
              <Badge ml="md" color={lecture.status === 'processed' ? 'teal' : 'orange'} variant="light">
                {lecture.status === 'processed' ? 'Processed' : 'Processing...'}
              </Badge>
            </Group>
            
            {!isEditing ? (
              <Button leftSection={<IconPencil size={16} />} variant="light" onClick={() => setIsEditing(true)}>
                Edit Note
              </Button>
            ) : (
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
        </Box>

        {/* Content Area */}
        <ScrollArea style={{ flex: 1, backgroundColor: isEditing ? '#f8f9fa' : '#fff' }} p="xl">
          {isEditing ? (
            <Textarea 
              minRows={30} 
              autosize 
              value={content}
              onChange={(e) => setContent(e.currentTarget.value)}
              variant="unstyled"
              styles={{ input: { fontFamily: 'monospace', fontSize: '14px', lineHeight: 1.6 } }}
            />
          ) : (
            <Box className="markdown-content" style={{ maxWidth: '800px', margin: '0 auto', color: '#171738', fontSize: '16px', lineHeight: 1.6 }}>
              {/* If we had marked.js we would render it, but for now just preserving newlines */}
              {content ? (
                <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>
              ) : (
                <Center h={200}><Text c="dimmed">No content available.</Text></Center>
              )}
            </Box>
          )}
        </ScrollArea>
      </Paper>

      {/* Right Column: Actions Sidebar */}
      <Paper withBorder radius="md" style={{ width: '350px', display: 'flex', flexDirection: 'column', backgroundColor: '#fafafa' }}>
        <Tabs defaultValue="ai" variant="outline" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Tabs.List grow>
            <Tabs.Tab value="ai" leftSection={<IconRobot size={14} />}>AI Actions</Tabs.Tab>
            <Tabs.Tab value="quiz" leftSection={<IconCards size={14} />}>Quizzes</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="ai" p="md" style={{ flex: 1, overflowY: 'auto' }}>
            <Title order={5} mb="md">AI Summary</Title>
            <Paper p="sm" withBorder radius="md" bg="white">
              {lecture.summary ? (
                <Box dangerouslySetInnerHTML={{ __html: lecture.summary }} style={{ fontSize: '14px', color: '#333' }} />
              ) : (
                <Text size="sm" c="dimmed" ta="center" py="xl">No summary generated.</Text>
              )}
            </Paper>
            <Button fullWidth mt="md" variant="light" color="indigo" leftSection={<IconRobot size={16} />}>
              Generate Summary
            </Button>
            <Divider my="xl" />
            <Title order={5} mb="md">Chat with this Note</Title>
            <Button fullWidth variant="light" color="blue" onClick={() => navigate(`/chat?lecture_id=${lecture.id}`)}>
              Open AI Chat
            </Button>
          </Tabs.Panel>

          <Tabs.Panel value="quiz" p="md" style={{ flex: 1, overflowY: 'auto' }}>
            <Title order={5} mb="md">Generate Quiz</Title>
            <Text size="sm" c="dimmed" mb="md">
              Test your knowledge on this lecture by generating a custom quiz using AI.
            </Text>
            <Button fullWidth color="pink" onClick={() => navigate(`/quiz?lecture_id=${lecture.id}`)}>
              Create Quiz
            </Button>
          </Tabs.Panel>
        </Tabs>
      </Paper>
    </Flex>
  );
}
