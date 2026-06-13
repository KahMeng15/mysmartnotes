import { useState, useEffect, useMemo } from 'react';
import { Box, Title, Text, Group, Card, Button, Badge, ActionIcon, Menu, Center, Loader, Stack, Modal, TextInput, Textarea, ColorInput, Select } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconDotsVertical, IconTrash, IconPencil, IconUpload, IconEdit, IconFile, IconChevronLeft, IconSearch, IconArrowsSort } from '@tabler/icons-react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchApi } from '../lib/api';

const getFriendlyFileType = (mimeType) => {
  if (!mimeType) return 'DOCUMENT';
  const type = mimeType.toLowerCase();
  if (type.includes('pdf')) return 'PDF';
  if (type.includes('presentation') || type.includes('powerpoint') || type.includes('pptx') || type.includes('presentationml')) return 'PowerPoint';
  if (type.includes('image') || type.includes('png') || type.includes('jpeg') || type.includes('jpg')) return 'Image';
  if (type.includes('word') || type.includes('docx') || type.includes('wordprocessingml') || type.includes('document')) return 'Word';
  if (type.includes('spreadsheet') || type.includes('excel') || type.includes('xlsx') || type.includes('spreadsheetml')) return 'Excel';
  
  const part = type.includes('/') ? type.split('/')[1] : type;
  if (part.includes('presentation')) return 'PowerPoint';
  if (part.includes('wordprocessingml') || part.includes('document')) return 'Word';
  if (part.includes('spreadsheetml')) return 'Excel';
  return part.toUpperCase();
};

const formatNoteDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  const day = date.getDate();
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
};

export default function SubjectView() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [subject, setSubject] = useState(null);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState(
    localStorage.getItem('smartnotes_sort_pref') || 
    JSON.parse(localStorage.getItem('user') || '{}').sort_preference || 
    'name_asc'
  );

  useEffect(() => {
    fetchApi('/auth/me').then(data => {
      if (data && data.sort_preference) {
        setSort(data.sort_preference);
        localStorage.setItem('smartnotes_sort_pref', data.sort_preference);
      }
    }).catch(err => console.error("Failed to load user preferences", err));
  }, []);

  const filteredNotes = useMemo(() => {
    let result = [...notes];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(n => 
        n.title.toLowerCase().includes(q) || 
        (n.file_name && n.file_name.toLowerCase().includes(q))
      );
    }
    
    result.sort((a, b) => {
      if (sort === 'name_asc') return a.title.localeCompare(b.title);
      if (sort === 'name_desc') return b.title.localeCompare(a.title);
      if (sort === 'date_desc') return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      if (sort === 'date_asc') return new Date(a.created_at || 0) - new Date(b.created_at || 0);
      return 0;
    });
    
    return result;
  }, [notes, search, sort]);

  // Subject Edit Modals
  const [editSubjectModalOpened, { open: openEditSubjectModal, close: closeEditSubjectModal }] = useDisclosure(false);
  const [deleteSubjectModalOpened, { open: openDeleteSubjectModal, close: closeDeleteSubjectModal }] = useDisclosure(false);
  const [editSubjectName, setEditSubjectName] = useState('');
  const [editSubjectDesc, setEditSubjectDesc] = useState('');
  const [editSubjectColor, setEditSubjectColor] = useState('#593C8F');

  // Note Action Modals
  const [renameModalOpened, { open: openRenameModal, close: closeRenameModal }] = useDisclosure(false);
  const [deleteNoteModalOpened, { open: openDeleteNoteModal, close: closeDeleteNoteModal }] = useDisclosure(false);
  const [editingNote, setEditingNote] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [deletingNote, setDeletingNote] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [subjectsData, allNotes] = await Promise.all([
          fetchApi('/subjects'),
          fetchApi('/notes')
        ]);
        
        const currentSub = subjectsData.find(s => s.id == id);
        setSubject(currentSub);
        
        setNotes(allNotes.filter(l => l.subject_id == id));
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

  const openRename = (note) => {
    setEditingNote(note);
    setNewTitle(note.title);
    openRenameModal();
  };

  const openDelete = (note) => {
    setDeletingNote(note);
    openDeleteNoteModal();
  };

  const handleRename = async () => {
    if (!newTitle.trim() || !editingNote) return;
    setSubmitting(true);
    try {
      await fetchApi(`/notes/${editingNote.id}`, {
        method: 'PUT',
        body: JSON.stringify({ title: newTitle.trim() })
      });
      setNotes(notes.map(l => l.id === editingNote.id ? { ...l, title: newTitle.trim() } : l));
      closeRenameModal();
    } catch (err) {
      alert("Failed to rename note: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const executeDeleteNote = async () => {
    if (!deletingNote) return;
    setSubmitting(true);
    try {
      await fetchApi(`/notes/${deletingNote.id}`, { method: 'DELETE' });
      setNotes(notes.filter(l => l.id !== deletingNote.id));
      closeDeleteNoteModal();
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
      {/* Sticky Header */}
      <Box py="xs" px="md" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)', backgroundColor: '#fff', zIndex: 20, margin: '-16px -16px 20px -16px' }}>
        <Group justify="space-between">
          <Group>
            <ActionIcon variant="subtle" color="gray" onClick={() => navigate(-1)}>
              <IconChevronLeft size={20} />
            </ActionIcon>
            <Group gap="xs" ml="xs">
              <Text size="sm" fw={500} c="dimmed" style={{ cursor: 'pointer' }} onClick={() => navigate('/mynotes')}>Notes</Text>
              {subject.group && (
                <>
                  <Text size="sm" c="dimmed">/</Text>
                  <Text size="sm" fw={500} c="dimmed" style={{ cursor: 'pointer' }} onClick={() => navigate(`/group/${subject.group.id}`)}>{subject.group.name}</Text>
                </>
              )}
            </Group>
          </Group>
        </Group>
      </Box>

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

      <Group mb="xl" align="flex-end">
        <TextInput
          placeholder="Search notes..."
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          style={{ flexGrow: 1 }}
        />
        <Select
          value={sort}
          onChange={async (val) => {
             setSort(val);
             localStorage.setItem('smartnotes_sort_pref', val);
             try {
               await fetchApi('/auth/profile', {
                 method: 'PUT',
                 body: JSON.stringify({ sort_preference: val })
               });
               const user = JSON.parse(localStorage.getItem('user') || '{}');
               user.sort_preference = val;
               localStorage.setItem('user', JSON.stringify(user));
             } catch (e) {
               console.error("Failed to update sort preference in DB", e);
             }
          }}
          data={[
            { value: 'name_asc', label: 'Name (A-Z)' },
            { value: 'name_desc', label: 'Name (Z-A)' },
            { value: 'date_desc', label: 'Newest First' },
            { value: 'date_asc', label: 'Oldest First' },
          ]}
          leftSection={<IconArrowsSort size={16} />}
          style={{ width: 180 }}
        />
      </Group>

      {filteredNotes.length > 0 ? (
        <Stack spacing="sm">
          {filteredNotes.map((note) => {
            const isProcessed = note.processing_time_ms != null || note.extracted_text != null || note.output_pdf_path != null;
            return (
              <Card
                key={note.id}
                shadow="sm"
                padding="md"
                radius="md"
                withBorder
              >
                <Group justify="space-between" wrap="nowrap">
                  <Box style={{ flex: 1 }}>
                    <Text fw={600} size="lg" style={{ cursor: 'pointer' }} onClick={() => navigate(`/note/${note.id}`)}>
                      {note.title}
                    </Text>
                    <Group gap="xs" mt={4}>
                      {!isProcessed && (
                        <Badge color="orange" variant="light" size="sm">
                          Processing...
                        </Badge>
                      )}
                      <Text size="xs" c="dimmed">
                        {getFriendlyFileType(note.file_type)} • {formatNoteDate(note.created_at)}
                      </Text>
                    </Group>
                  </Box>

                  <Group gap="xs">
                    <Button variant="light" size="sm" onClick={() => navigate(`/note/${note.id}`)}>
                      View Note
                    </Button>
                    <Menu position="bottom-end" withinPortal>
                      <Menu.Target>
                        <ActionIcon variant="subtle" color="gray">
                          <IconDotsVertical size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => openRename(note)}>Rename</Menu.Item>
                        <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => openDelete(note)}>Delete</Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                </Group>
              </Card>
            );
          })}
        </Stack>
      ) : search.trim() ? (
        <Center h={200}>
          <Box ta="center">
            <IconSearch size={48} color="var(--mantine-color-gray-4)" />
            <Text c="dimmed" mt="md">No notes found matching "{search}"</Text>
          </Box>
        </Center>
      ) : (
        <Center h={200}>
          <Box ta="center">
            <IconFile size={48} color="var(--mantine-color-gray-4)" />
            <Text c="dimmed" mt="md">No notes uploaded to this subject yet.</Text>
            <Button mt="md" variant="light" onClick={() => navigate(`/upload?subject_id=${subject.id}`)}>
              Upload your first file
            </Button>
          </Box>
        </Center>
      )}

      {/* Modals */}
      <Modal opened={editSubjectModalOpened} onClose={closeEditSubjectModal} title="Edit Subject" centered>
        <form onSubmit={(e) => { e.preventDefault(); handleUpdateSubject(); }}>
          <Stack>
            <TextInput required label="Subject Name" value={editSubjectName} onChange={(e) => setEditSubjectName(e.currentTarget.value)} data-autofocus />
            <Textarea label="Description" value={editSubjectDesc} onChange={(e) => setEditSubjectDesc(e.currentTarget.value)} rows={3} />
            <ColorInput label="Color Tag" value={editSubjectColor} onChange={setEditSubjectColor} format="hex" />
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={closeEditSubjectModal}>Cancel</Button>
              <Button type="submit" loading={submitting}>Save Changes</Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal opened={deleteSubjectModalOpened} onClose={closeDeleteSubjectModal} title="Confirm Delete Subject" centered>
        <form onSubmit={(e) => { e.preventDefault(); executeDeleteSubject(); }}>
          <Stack>
            <Text size="sm">Are you sure you want to delete <b>{subject.name}</b>? This will permanently remove all associated notes and quizzes.</Text>
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={closeDeleteSubjectModal}>Cancel</Button>
              <Button type="submit" color="red" loading={submitting} data-autofocus>Delete Subject</Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal opened={renameModalOpened} onClose={closeRenameModal} title="Rename Note" centered>
        <form onSubmit={(e) => { e.preventDefault(); handleRename(); }}>
          <Stack>
            <TextInput label="Note Title" value={newTitle} onChange={(e) => setNewTitle(e.currentTarget.value)} data-autofocus />
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={closeRenameModal}>Cancel</Button>
              <Button type="submit" loading={submitting}>Save</Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal opened={deleteNoteModalOpened} onClose={closeDeleteNoteModal} title="Confirm Delete" centered>
        <form onSubmit={(e) => { e.preventDefault(); executeDeleteNote(); }}>
          <Stack>
            <Text size="sm">Are you sure you want to delete the note <b>{deletingNote?.title}</b>? This action cannot be undone.</Text>
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={closeDeleteNoteModal}>Cancel</Button>
              <Button type="submit" color="red" loading={submitting} data-autofocus>Delete Note</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Box>
  );
}
