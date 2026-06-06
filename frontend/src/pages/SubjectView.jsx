import { useState, useEffect } from 'react';
import { Box, Title, Text, Group, Card, SimpleGrid, Button, Badge, ActionIcon, Menu, Center, Loader } from '@mantine/core';
import { IconFile, IconDotsVertical, IconTrash, IconPencil, IconUpload } from '@tabler/icons-react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchApi } from '../lib/api';

export default function SubjectView() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [subject, setSubject] = useState(null);
  const [lectures, setLectures] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [subjectsData, allLectures] = await Promise.all([
          fetchApi('/subjects'),
          fetchApi('/lectures')
        ]);
        
        const currentSub = subjectsData.find(s => s.id == id);
        setSubject(currentSub);
        
        setLectures(allLectures.filter(l => l.subject_id == id));
      } catch (err) {
        console.error("Failed to load subject data", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [id]);

  if (loading) {
    return (
      <Center h="50vh">
        <Loader size="lg" />
      </Center>
    );
  }

  if (!subject) {
    return (
      <Center h="50vh">
        <Text c="dimmed">Subject not found.</Text>
      </Center>
    );
  }

  return (
    <Box>
      <Group justify="space-between" mb="lg">
        <Box>
          <Title order={1}>{subject.name}</Title>
          <Text c="dimmed">{subject.description || 'No description'}</Text>
        </Box>
        <Button leftSection={<IconUpload size={16} />} onClick={() => navigate(`/upload?subject_id=${subject.id}`)}>
          Upload Notes
        </Button>
      </Group>

      {lectures.length > 0 ? (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
          {lectures.map((lecture) => (
            <Card
              key={lecture.id}
              shadow="sm"
              padding="lg"
              radius="md"
              withBorder
              onClick={() => navigate(`/lecture/${lecture.id}`)}
              style={{ cursor: 'pointer', transition: 'transform 150ms ease', '&:hover': { transform: 'translateY(-2px)' } }}
            >
              <Group justify="space-between" mb="xs" wrap="nowrap">
                <Text fw={600} size="lg" truncate>
                  {lecture.title}
                </Text>
                <Menu position="bottom-end" withinPortal onClick={(e) => e.stopPropagation()}>
                  <Menu.Target>
                    <ActionIcon variant="subtle" color="gray" onClick={(e) => e.stopPropagation()}>
                      <IconDotsVertical size={16} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item leftSection={<IconPencil size={14} />}>Rename</Menu.Item>
                    <Menu.Item color="red" leftSection={<IconTrash size={14} />}>Delete</Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>

              <Badge color={lecture.status === 'processed' ? 'teal' : 'orange'} variant="light" mb="md">
                {lecture.status === 'processed' ? 'Processed' : 'Processing...'}
              </Badge>

              <Text size="sm" c="dimmed">
                Uploaded: {new Date(lecture.created_at).toLocaleDateString()}
              </Text>
            </Card>
          ))}
        </SimpleGrid>
      ) : (
        <Center h={200}>
          <Box ta="center">
            <IconFile size={48} color="var(--mantine-color-gray-4)" />
            <Text c="dimmed" mt="md">No lectures uploaded to this subject yet.</Text>
            <Button mt="md" variant="light" onClick={() => navigate(`/upload?subject_id=${subject.id}`)}>
              Upload your first file
            </Button>
          </Box>
        </Center>
      )}
    </Box>
  );
}
