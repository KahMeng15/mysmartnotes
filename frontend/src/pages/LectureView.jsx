import { useState, useEffect } from 'react';
import { Box, Title, Tabs, Paper, Textarea, Group, Button, Badge, Center, Loader, Text } from '@mantine/core';
import { IconDeviceFloppy, IconRobot, IconCards, IconFileText } from '@tabler/icons-react';
import { useParams } from 'react-router-dom';
import { fetchApi } from '../lib/api';

export default function LectureView() {
  const { id } = useParams();
  const [lecture, setLecture] = useState(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
      // Handle success notification here if needed
    } catch (err) {
      console.error("Failed to save", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Center h="50vh">
        <Loader size="lg" />
      </Center>
    );
  }

  if (!lecture) {
    return (
      <Center h="50vh">
        <Text c="dimmed">Lecture not found.</Text>
      </Center>
    );
  }

  return (
    <Box>
      <Group justify="space-between" mb="md">
        <Box>
          <Title order={2}>{lecture.title}</Title>
          <Badge mt="xs" color={lecture.status === 'processed' ? 'teal' : 'orange'}>
            {lecture.status === 'processed' ? 'Processed' : 'Processing...'}
          </Badge>
        </Box>
        <Button 
          leftSection={<IconDeviceFloppy size={16} />} 
          onClick={handleSave}
          loading={saving}
        >
          Save Changes
        </Button>
      </Group>

      <Tabs defaultValue="content">
        <Tabs.List mb="md">
          <Tabs.Tab value="content" leftSection={<IconFileText size={16} />}>Raw Content</Tabs.Tab>
          <Tabs.Tab value="summary" leftSection={<IconRobot size={16} />}>AI Summary</Tabs.Tab>
          <Tabs.Tab value="flashcards" leftSection={<IconCards size={16} />}>Flashcards</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="content">
          <Paper withBorder p="md" radius="md">
            <Textarea 
              minRows={20} 
              autosize 
              value={content}
              onChange={(e) => setContent(e.currentTarget.value)}
              variant="unstyled"
              styles={{ input: { fontFamily: 'monospace', fontSize: '14px', lineHeight: 1.6 } }}
            />
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="summary">
          <Paper withBorder p="xl" radius="md" bg="gray.0">
            {lecture.summary ? (
              <Box dangerouslySetInnerHTML={{ __html: lecture.summary }} />
            ) : (
              <Center p="xl">
                <Text c="dimmed">No summary available. Did you enable AI generation?</Text>
              </Center>
            )}
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="flashcards">
          <Paper withBorder p="xl" radius="md">
            <Center p="xl">
              <Text c="dimmed">Flashcards feature coming soon...</Text>
            </Center>
          </Paper>
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
}
