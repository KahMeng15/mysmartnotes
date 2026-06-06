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
  IconChevronDown,
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
  const [expandedGroups, setExpandedGroups] = useState(null);

  // Modals
  const [groupModalOpened, { open: openGroupModal, close: closeGroupModal }] = useDisclosure(false);
  const [subjectModalOpened, { open: openSubjectModal, close: closeSubjectModal }] = useDisclosure(false);
  const [editGroupModalOpened, { open: openEditGroupModal, close: closeEditGroupModal }] = useDisclosure(false);
  const [deleteGroupModalOpened, { open: openDeleteGroupModal, close: closeDeleteGroupModal }] = useDisclosure(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [groupToDelete, setGroupToDelete] = useState(null);
  
  // Creation States
  const [newGroupName, setNewGroupName] = useState('');
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectDesc, setNewSubjectDesc] = useState('');
  const [newSubjectColor, setNewSubjectColor] = useState('#593C8F');
  const [activeGroupId, setActiveGroupId] = useState(null);
  
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

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

  const handleAddSubjectClick = (groupId) => {
    setActiveGroupId(groupId);
    setNewSubjectName('');
    setNewSubjectDesc('');
    setNewSubjectColor('#593C8F');
    openSubjectModal();
  };

  const handleEditGroupClick = (group) => {
    setEditingGroup(group);
    setNewGroupName(group.name);
    openEditGroupModal();
  };

  const handleCreateOrEditGroup = async () => {
    if (!newGroupName.trim()) return;
    setSubmitting(true);
    try {
      if (editingGroup) {
        await fetchApi(`/groups/${editingGroup.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: newGroupName.trim() })
        });
        closeEditGroupModal();
      } else {
        await fetchApi('/groups', {
          method: 'POST',
          body: JSON.stringify({ name: newGroupName.trim() })
        });
        closeGroupModal();
      }
      setNewGroupName('');
      setEditingGroup(null);
      loadData();
    } catch (err) {
      alert("Failed to save group: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateSubject = async () => {
    if (!newSubjectName.trim()) return;
    setSubmitting(true);
    try {
      await fetchApi('/subjects', {
        method: 'POST',
        body: JSON.stringify({
          name: newSubjectName.trim(),
          description: newSubjectDesc.trim(),
          color: newSubjectColor,
          group_id: activeGroupId
        })
      });
      closeSubjectModal();
      loadData();
    } catch (err) {
      alert("Failed to create subject: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteClick = (group) => {
    setGroupToDelete(group);
    openDeleteGroupModal();
  };

  const executeDeleteGroup = async () => {
    if (!groupToDelete) return;
    setSubmitting(true);
    try {
      await fetchApi(`/groups/${groupToDelete.id}`, { method: 'DELETE' });
      closeDeleteGroupModal();
      setGroupToDelete(null);
      loadData();
    } catch (err) {
      alert('Failed to delete group: ' + err.message);
    } finally {
      setSubmitting(false);
    }
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

  useEffect(() => {
    if (processedGroups.length > 0 && expandedGroups === null) {
      setExpandedGroups(processedGroups.map(g => g.id.toString()));
    }
  }, [processedGroups, expandedGroups]);

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
        <Title order={1} fw={800} style={{ fontFamily: 'Instrument Sans, sans-serif', color: '#171738' }}>My Notes</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => { setNewGroupName(''); openGroupModal(); }}>
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
        <Accordion 
          multiple 
          value={expandedGroups || []}
          onChange={setExpandedGroups}
          variant="separated" 
          styles={{ item: { backgroundColor: '#fff' } }}
          chevron={
            <ActionIcon component="div" variant="light" color="gray" size="lg" style={{ pointerEvents: 'none' }}>
              <IconChevronDown size={18} />
            </ActionIcon>
          }
        >
          {processedGroups.map((group) => (
            <Accordion.Item key={group.id} value={group.id.toString()}>
              <Accordion.Control>
                <Group justify="space-between" wrap="nowrap">
                  <Title order={3} fw={700} c="#171738" style={{ fontFamily: 'Instrument Sans, sans-serif' }}>
                    {group.name}
                  </Title>

                  <Group gap="xs">
                    <Badge color="gray" variant="light" size="lg" mr="sm">
                      {group.subjects.length} Subjects
                    </Badge>

                    {group.id !== 'ungrouped' && expandedGroups?.includes(group.id.toString()) && (
                      <Group gap="xs" mr="md" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                        <ActionIcon component="div" variant="light" color="blue" size="lg" onClick={() => handleAddSubjectClick(group.id)} title="Add Subject">
                          <IconPlus size={18} />
                        </ActionIcon>
                        <ActionIcon component="div" variant="light" color="indigo" size="lg" onClick={() => navigate(`/upload?group_id=${group.id}`)} title="Upload Note">
                          <IconUpload size={18} />
                        </ActionIcon>
                        <ActionIcon component="div" variant="light" color="gray" size="lg" onClick={() => handleEditGroupClick(group)} title="Edit Group">
                          <IconEdit size={18} />
                        </ActionIcon>
                        <ActionIcon component="div" variant="light" color="red" size="lg" title="Delete Group" onClick={() => handleDeleteClick(group)}>
                          <IconTrash size={18} />
                        </ActionIcon>
                      </Group>
                    )}
                  </Group>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
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
                        <Text fw={600} size="lg" mb="xs" c="#171738">
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
            <Button onClick={() => { setNewGroupName(''); openGroupModal(); }}>Create your first Group</Button>
          </Stack>
        </Center>
      )}

      {/* Modals */}
      <Modal opened={groupModalOpened} onClose={closeGroupModal} title="Create New Group" centered>
        <Stack>
          <TextInput required label="Group Name" placeholder="e.g. Semester 1, Year 2" value={newGroupName} onChange={(e) => setNewGroupName(e.currentTarget.value)} data-autofocus />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={closeGroupModal}>Cancel</Button>
            <Button onClick={handleCreateOrEditGroup} loading={submitting}>Create Group</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={editGroupModalOpened} onClose={closeEditGroupModal} title="Edit Group" centered>
        <Stack>
          <TextInput required label="Group Name" value={newGroupName} onChange={(e) => setNewGroupName(e.currentTarget.value)} data-autofocus />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={closeEditGroupModal}>Cancel</Button>
            <Button onClick={handleCreateOrEditGroup} loading={submitting}>Save Changes</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={subjectModalOpened} onClose={closeSubjectModal} title="Add New Subject" centered>
        <Stack>
          <TextInput required label="Subject Name" placeholder="e.g. Calculus I" value={newSubjectName} onChange={(e) => setNewSubjectName(e.currentTarget.value)} data-autofocus />
          <Textarea label="Description (Optional)" placeholder="Brief overview" value={newSubjectDesc} onChange={(e) => setNewSubjectDesc(e.currentTarget.value)} rows={3} />
          <ColorInput label="Color Tag" value={newSubjectColor} onChange={setNewSubjectColor} format="hex" />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={closeSubjectModal}>Cancel</Button>
            <Button onClick={handleCreateSubject} loading={submitting}>Add Subject</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={deleteGroupModalOpened} onClose={closeDeleteGroupModal} title="Confirm Delete" centered>
        <Stack>
          <Text size="sm">Are you sure you want to delete the group <b>{groupToDelete?.name}</b>? This action cannot be undone.</Text>
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={closeDeleteGroupModal}>Cancel</Button>
            <Button color="red" onClick={executeDeleteGroup} loading={submitting}>Delete Group</Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
}
