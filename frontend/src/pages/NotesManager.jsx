import { useState, useEffect, useMemo } from 'react';
import {
  Title,
  Text,
  Button,
  Group,
  TextInput,
  Select,
  Accordion,
  Card,
  SimpleGrid,
  ActionIcon,
  Menu,
  Modal,
  ColorInput,
  Textarea,
  Stack,
  Box,
  Badge,
  Loader,
  Center,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconPlus,
  IconSearch,
  IconArrowsSort,
  IconDotsVertical,
  IconEdit,
  IconTrash,
  IconUpload,
  IconFiles,
} from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { fetchApi } from '../lib/api';

export default function NotesManager() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');
  
  const [groups, setGroups] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [groupModalOpened, { open: openGroupModal, close: closeGroupModal }] = useDisclosure(false);
  const [subjectModalOpened, { open: openSubjectModal, close: closeSubjectModal }] = useDisclosure(false);
  const [activeGroupId, setActiveGroupId] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [groupsData, subjectsData] = await Promise.all([
          fetchApi('/groups'),
          fetchApi('/subjects')
        ]);
        setGroups(groupsData || []);
        setSubjects(subjectsData || []);
      } catch (err) {
        console.error("Failed to load notes data", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const handleAddSubjectClick = (groupId) => {
    setActiveGroupId(groupId);
    openSubjectModal();
  };

  // Combine groups and subjects, filter, and sort
  const processedGroups = useMemo(() => {
    // 1. Combine
    let combined = groups.map(g => ({
      ...g,
      subjects: subjects.filter(s => s.group_id === g.id)
    }));

    // Add Ungrouped if there are subjects without a group
    const ungroupedSubjects = subjects.filter(s => !s.group_id);
    if (ungroupedSubjects.length > 0) {
      combined.push({
        id: 'ungrouped',
        name: 'Ungrouped Subjects',
        subjects: ungroupedSubjects
      });
    }

    // 2. Filter by search
    if (search.trim()) {
      const q = search.toLowerCase();
      combined = combined.map(g => ({
        ...g,
        subjects: g.subjects.filter(s => 
          s.name.toLowerCase().includes(q) || 
          (s.description && s.description.toLowerCase().includes(q))
        )
      })).filter(g => g.name.toLowerCase().includes(q) || g.subjects.length > 0);
    }

    // 3. Sort subjects within groups
    combined.forEach(g => {
      g.subjects.sort((a, b) => {
        if (sort === 'name') return a.name.localeCompare(b.name);
        if (sort === 'date') return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        return 0;
      });
    });

    return combined;
  }, [groups, subjects, search, sort]);

  if (loading) {
    return (
      <Center h="50vh">
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Group justify="space-between" mb="lg">
        <Title order={1}>My Notes</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={openGroupModal}>
          Create Group
        </Button>
      </Group>

      {/* Controls */}
      <Group mb="xl" grow>
        <TextInput
          placeholder="Search groups, subjects..."
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <Select
          value={sort}
          onChange={setSort}
          data={[
            { value: 'name', label: 'Sort by Name (A-Z)' },
            { value: 'date', label: 'Sort by Date Created' },
          ]}
          leftSection={<IconArrowsSort size={16} />}
          style={{ flex: 0.3 }}
        />
      </Group>

      {/* Groups Accordion */}
      {processedGroups.length > 0 ? (
        <Accordion multiple defaultValue={processedGroups.map(g => g.id.toString())} variant="separated">
          {processedGroups.map((group) => (
            <Accordion.Item key={group.id} value={group.id.toString()}>
              <Accordion.Control>
                <Group justify="space-between">
                  <Text fw={600} size="lg">
                    {group.name}
                  </Text>
                  <Badge color="gray" variant="light">
                    {group.subjects.length} Subjects
                  </Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                {/* Group Actions (hide for Ungrouped) */}
                {group.id !== 'ungrouped' && (
                  <Group mb="md" justify="flex-end">
                    <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={() => handleAddSubjectClick(group.id)}>
                      Add Subject
                    </Button>
                    <Button variant="light" color="indigo" size="xs" leftSection={<IconUpload size={14} />} onClick={() => navigate(`/upload?group_id=${group.id}`)}>
                      Upload
                    </Button>
                    <Menu position="bottom-end">
                      <Menu.Target>
                        <ActionIcon variant="subtle" color="gray">
                          <IconDotsVertical size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item leftSection={<IconEdit size={14} />}>Edit Group</Menu.Item>
                        <Menu.Item color="red" leftSection={<IconTrash size={14} />}>Delete Group</Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                )}

                {/* Subjects Grid */}
                {group.subjects.length > 0 ? (
                  <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
                    {group.subjects.map((subject) => (
                      <Card
                        key={subject.id}
                        shadow="sm"
                        padding="lg"
                        radius="md"
                        withBorder
                        onClick={() => navigate(`/subject/${subject.id}`)}
                        style={{ cursor: 'pointer', borderLeft: `4px solid ${subject.color || '#228be6'}`, transition: 'transform 150ms ease', '&:hover': { transform: 'translateY(-2px)' } }}
                      >
                        <Text fw={600} size="lg" mb="xs">
                          {subject.name}
                        </Text>
                        <Text size="sm" c="dimmed" style={{ minHeight: '3rem' }}>
                          {subject.description || 'No description'}
                        </Text>
                        <Group mt="md">
                          <Badge leftSection={<IconFiles size={12} />} color="blue" variant="light">
                            View Notes
                          </Badge>
                        </Group>
                      </Card>
                    ))}
                  </SimpleGrid>
                ) : (
                  <Text c="dimmed" fs="italic" ta="center" py="md">
                    No subjects in this group yet.
                  </Text>
                )}
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      ) : (
        <Center h={200}>
          <Stack align="center">
            <IconFiles size={48} color="var(--mantine-color-gray-4)" />
            <Text c="dimmed">No groups or subjects found.</Text>
            <Button onClick={openGroupModal}>Create your first Group</Button>
          </Stack>
        </Center>
      )}

      {/* Modals */}
      <Modal opened={groupModalOpened} onClose={closeGroupModal} title="Create New Group" centered>
        <Stack>
          <TextInput required label="Group Name" placeholder="e.g. Semester 1, Year 2" data-autofocus />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={closeGroupModal}>
              Cancel
            </Button>
            <Button onClick={closeGroupModal}>Create Group</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={subjectModalOpened} onClose={closeSubjectModal} title="Add New Subject" centered>
        <Stack>
          <TextInput required label="Subject Name" placeholder="e.g. Calculus I" data-autofocus />
          <Textarea label="Description (Optional)" placeholder="Brief overview" rows={3} />
          <ColorInput label="Color Tag" defaultValue="#593C8F" format="hex" />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={closeSubjectModal}>
              Cancel
            </Button>
            <Button onClick={closeSubjectModal}>Add Subject</Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
}
