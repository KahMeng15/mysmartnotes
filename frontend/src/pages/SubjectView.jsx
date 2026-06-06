import { useState, useEffect } from 'react';
import { Box, Title, Text, Group, Card, Button, Badge, ActionIcon, Menu, Center, Loader, Stack, Modal, TextInput, Textarea, ColorInput } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconDotsVertical, IconTrash, IconPencil, IconUpload, IconEdit, IconFile } from '@tabler/icons-react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchApi } from '../lib/api';

export default function SubjectView() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [subject, setSubject] = useState(null);
  const [lectures, setLectures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Subject Edit Modals
  const [editSubjectModalOpened, { open: openEditSubjectModal, close: closeEditSubjectModal }] = useDisclosure(false);
  const [deleteSubjectModalOpened, { open: openDeleteSubjectModal, close: closeDeleteSubjectModal }] = useDisclosure(false);
  const [editSubjectName, setEditSubjectName] = useState('');
  const [editSubjectDesc, setEditSubjectDesc] = useState('');
  const [editSubjectColor, setEditSubjectColor] = useState('#593C8F');

  // Lecture Action Modals
  const [renameModalOpened, { open: openRenameModal, close: closeRenameModal }] = useDisclosure(false);
  const [deleteLectureModalOpened, { open: openDeleteLectureModal, close: closeDeleteLectureModal }] = useDisclosure(false);
  const [editingLecture, setEditingLecture] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [deletingLecture, setDeletingLecture] = useState(null);

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

  const handleEditSubjectClick = () => {
    setEditSubjectName(subject.name);
    setEditSubjectDesc(subject.description || '');
    setEditSubjectColor(subject.color || '#593C8F');
    openEditSubjectModal();
  };

  const handleUpdateSubject = async () => {
    if (!editSubjectName.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetchApi(`/subjects/${subject.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editSubjectName.trim(),
          description: editSubjectDesc.trim(),
          color: editSubjectColor
        })
      });
      setSubject(res);
      closeEditSubjectModal();
    } catch (err) {
      alert("Failed to update subject: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const executeDeleteSubject = async () => {
    setSubmitting(true);
    try {
      await fetchApi(`/subjects/${subject.id}`, { method: 'DELETE' });
      closeDeleteSubjectModal();
      navigate('/mynotes');
    } catch (err) {
      alert("Failed to delete subject: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openRename = (lecture) => {
    setEditingLecture(lecture);
    setNewTitle(lecture.title);
    openRenameModal();
  };

  const openDelete = (lecture) => {
    setDeletingLecture(lecture);
    openDeleteLectureModal();
  };

  const handleRename = async () => {
    if (!newTitle.trim() || !editingLecture) return;
    setSubmitting(true);
    try {
      await fetchApi(`/lectures/${editingLecture.id}`, {
        method: 'PUT',
        body: JSON.stringify({ title: newTitle.trim() })
      });
      setLectures(lectures.map(l => l.id === editingLecture.id ? { ...l, title: newTitle.trim() } : l));
      closeRenameModal();
    } catch (err) {
      alert("Failed to rename note: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const executeDeleteLecture = async () => {
    if (!deletingLecture) return;
    setSubmitting(true);
    try {
      await fetchApi(`/lectures/${deletingLecture.id}`, { method: 'DELETE' });
      setLectures(lectures.filter(l => l.id !== deletingLecture.id));
      closeDeleteLectureModal();
    } catch (err) {
      alert("Failed to delete note: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

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
        <Group gap="xs">
          <ActionIcon variant="light" color="gray" size="lg" title="Edit Subject" onClick={handleEditSubjectClick}>
            <IconEdit size={18} />
          </ActionIcon>
          <ActionIcon variant="light" color="red" size="lg" title="Delete Subject" onClick={openDeleteSubjectModal}>
            <IconTrash size={18} />
          </ActionIcon>
          <Button leftSection={<IconUpload size={16} />} onClick={() => navigate(`/upload?subject_id=${subject.id}`)}>
            Upload Notes
          </Button>
        </Group>
      </Group>

      {lectures.length > 0 ? (
        <Stack spacing="sm">
          {lectures.map((lecture) => {
            const isProcessed = lecture.processing_time_ms != null || lecture.extracted_text != null || lecture.output_pdf_path != null;
            return (
              <Card
                key={lecture.id}
                shadow="sm"
                padding="md"
                radius="md"
                withBorder
              >
                <Group justify="space-between" wrap="nowrap">
                  <Box style={{ flex: 1 }}>
                    <Text fw={600} size="lg" style={{ cursor: 'pointer' }} onClick={() => navigate(`/lecture/${lecture.id}`)}>
                      {lecture.title}
                    </Text>
                    <Group gap="xs" mt={4}>
                      <Badge color={isProcessed ? 'teal' : 'orange'} variant="light" size="sm">
                        {isProcessed ? 'Processed' : 'Processing...'}
                      </Badge>
                      <Text size="xs" c="dimmed">
                        {lecture.file_type?.split('/').pop().toUpperCase() || 'DOCUMENT'} • {new Date(lecture.created_at).toLocaleDateString()}
                      </Text>
                    </Group>
                  </Box>

                  <Group gap="xs">
                    <Button variant="light" size="sm" onClick={() => navigate(`/lecture/${lecture.id}`)}>
                      View Note
                    </Button>
                    <Menu position="bottom-end" withinPortal>
                      <Menu.Target>
                        <ActionIcon variant="subtle" color="gray">
                          <IconDotsVertical size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => openRename(lecture)}>Rename</Menu.Item>
                        <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => openDelete(lecture)}>Delete</Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                </Group>
              </Card>
            );
          })}
        </Stack>
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

      {/* Modals */}
      <Modal opened={editSubjectModalOpened} onClose={closeEditSubjectModal} title="Edit Subject" centered>
        <Stack>
          <TextInput required label="Subject Name" value={editSubjectName} onChange={(e) => setEditSubjectName(e.currentTarget.value)} data-autofocus />
          <Textarea label="Description" value={editSubjectDesc} onChange={(e) => setEditSubjectDesc(e.currentTarget.value)} rows={3} />
          <ColorInput label="Color Tag" value={editSubjectColor} onChange={setEditSubjectColor} format="hex" />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={closeEditSubjectModal}>Cancel</Button>
            <Button onClick={handleUpdateSubject} loading={submitting}>Save Changes</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={deleteSubjectModalOpened} onClose={closeDeleteSubjectModal} title="Confirm Delete Subject" centered>
        <Stack>
          <Text size="sm">Are you sure you want to delete <b>{subject.name}</b>? This will permanently remove all associated notes and quizzes.</Text>
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={closeDeleteSubjectModal}>Cancel</Button>
            <Button color="red" onClick={executeDeleteSubject} loading={submitting}>Delete Subject</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={renameModalOpened} onClose={closeRenameModal} title="Rename Note" centered>
        <Stack>
          <TextInput label="Note Title" value={newTitle} onChange={(e) => setNewTitle(e.currentTarget.value)} data-autofocus />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={closeRenameModal}>Cancel</Button>
            <Button onClick={handleRename} loading={submitting}>Save</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={deleteLectureModalOpened} onClose={closeDeleteLectureModal} title="Confirm Delete" centered>
        <Stack>
          <Text size="sm">Are you sure you want to delete the note <b>{deletingLecture?.title}</b>? This action cannot be undone.</Text>
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={closeDeleteLectureModal}>Cancel</Button>
            <Button color="red" onClick={executeDeleteLecture} loading={submitting}>Delete Note</Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
}
