import { useState, useEffect, useMemo } from 'react';
import { Box, Title, Text, Group, Card, Button, Badge, ActionIcon, Menu, Center, Loader, Stack, Modal, TextInput, Textarea, ColorInput, Select, Code, Anchor, Tabs, Checkbox } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconDotsVertical, IconTrash, IconPencil, IconUpload, IconEdit, IconFile, IconChevronLeft, IconSearch, IconArrowsSort, IconInfoCircle, IconRefresh } from '@tabler/icons-react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchApi, getAuthToken } from '../lib/api';

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
  const [exercises, setExercises] = useState([]);
  const [generatedNotes, setGeneratedNotes] = useState([]);
  const [activeTab, setActiveTab] = useState('resources');
  const [selectedExercises, setSelectedExercises] = useState([]);
  const [merging, setMerging] = useState(false);

  const handleDownload = async (noteId, fileName) => {
    try {
      const token = getAuthToken();
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await fetch(`/api/notes/${noteId}/download-file`, {
        headers
      });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'download';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (error) {
      console.error('Failed to download file:', error);
    }
  };
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
  const [reprocessNoteModalOpened, { open: openReprocessNoteModal, close: closeReprocessNoteModal }] = useDisclosure(false);
  const [editingNote, setEditingNote] = useState(null);
  const [reprocessingNote, setReprocessingNote] = useState(null);
  const [infoModalNote, setInfoModalNote] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [deletingNote, setDeletingNote] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [subjectsData, allNotes, exercisesData, summariesData] = await Promise.all([
          fetchApi('/subjects'),
          fetchApi('/notes'),
          fetchApi(`/exercises/subject/${id}`),
          fetchApi(`/summaries?subject_id=${id}`)
        ]);
        
        const currentSub = subjectsData.find(s => s.id == id);
        setSubject(currentSub);
        
        setNotes(allNotes.filter(l => l.subject_id == id));
        setExercises(exercisesData || []);
        setGeneratedNotes(summariesData || []);
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

  const openReprocess = (note) => {
    setReprocessingNote(note);
    openReprocessNoteModal();
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

  const executeReprocessNote = async () => {
    if (!reprocessingNote) return;
    setSubmitting(true);
    try {
      const res = await fetchApi(`/notes/${reprocessingNote.id}/reprocess`, {
        method: 'POST'
      });
      // The API returns the updated note
      setNotes(notes.map(l => l.id === reprocessingNote.id ? res : l));
      closeReprocessNoteModal();
    } catch (err) {
      alert("Failed to reprocess note: " + err.message);
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

      <Tabs value={activeTab} onChange={setActiveTab} mb="md">
        <Tabs.List>
          <Tabs.Tab value="resources">Resources</Tabs.Tab>
          <Tabs.Tab value="exercises">Exercises</Tabs.Tab>
          <Tabs.Tab value="generated">Generated Notes</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="resources" pt="xl">
          {filteredNotes.length > 0 ? (
            <Stack spacing="sm">
              {filteredNotes.map((note) => {
                const isProcessed = note.processing_time_ms != null || note.extracted_text != null || note.extracted_content_structured != null || note.output_pdf_path != null;
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
                            <Menu.Item leftSection={<IconRefresh size={14} />} onClick={() => openReprocess(note)}>Reprocess</Menu.Item>
                            <Menu.Item leftSection={<IconInfoCircle size={14} />} onClick={(e) => { e.stopPropagation(); setInfoModalNote(note); }}>System Info</Menu.Item>
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
        </Tabs.Panel>
        
        <Tabs.Panel value="exercises" pt="xl">
          <Group mb="md" justify="space-between">
            <Text>Select multiple exercises to merge them into one.</Text>
            {selectedExercises.length > 1 && (
              <Button 
                onClick={async () => {
                  setMerging(true);
                  try {
                    const res = await fetchApi('/exercises/merge', {
                      method: 'POST',
                      body: JSON.stringify({ exercise_ids: selectedExercises, title: "Merged Exercises" })
                    });
                    setExercises([...exercises, res]);
                    setSelectedExercises([]);
                  } catch (e) {
                    alert("Failed to merge exercises: " + e.message);
                  } finally {
                    setMerging(false);
                  }
                }}
                loading={merging}
              >
                Merge Selected ({selectedExercises.length})
              </Button>
            )}
          </Group>
          {exercises.length > 0 ? (
            <Stack spacing="sm">
              {exercises.map((ex) => (
                <Card key={ex.id} shadow="sm" padding="md" radius="md" withBorder>
                  <Group justify="space-between" wrap="nowrap">
                    <Group>
                      <Checkbox 
                        checked={selectedExercises.includes(ex.id)}
                        onChange={(e) => {
                          if (e.currentTarget.checked) {
                            setSelectedExercises([...selectedExercises, ex.id]);
                          } else {
                            setSelectedExercises(selectedExercises.filter(id => id !== ex.id));
                          }
                        }}
                      />
                      <Box>
                        <Text fw={600} size="lg" style={{ cursor: 'pointer' }} onClick={() => navigate(`/exercises/${ex.id}`)}>
                          {ex.title}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {formatNoteDate(ex.created_at)}
                        </Text>
                      </Box>
                    </Group>
                    <Group gap="xs">
                      <Button variant="light" size="sm" onClick={() => navigate(`/exercises/${ex.id}`)}>
                        View Exercise
                      </Button>
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                          <ActionIcon variant="subtle" color="gray">
                            <IconDotsVertical size={16} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={async () => {
                            if (confirm("Delete this exercise?")) {
                              await fetchApi(`/exercises/${ex.id}`, { method: 'DELETE' });
                              setExercises(exercises.filter(e => e.id !== ex.id));
                            }
                          }}>Delete</Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Group>
                  </Group>
                </Card>
              ))}
            </Stack>
          ) : (
            <Center h={200}>
              <Box ta="center">
                <Text c="dimmed">No exercises found.</Text>
                <Button mt="md" variant="light" onClick={() => navigate(`/upload?subject_id=${subject.id}`)}>
                  Upload an Exercise
                </Button>
              </Box>
            </Center>
          )}
        </Tabs.Panel>
        
        <Tabs.Panel value="generated" pt="xl">
          {generatedNotes.length > 0 ? (
            <Stack spacing="sm">
              {generatedNotes.map((gn) => (
                <Card key={gn.id} shadow="sm" padding="md" radius="md" withBorder>
                   <Group justify="space-between" wrap="nowrap">
                      <Box>
                        <Text fw={600} size="lg" style={{ cursor: 'pointer' }} onClick={() => navigate(`/note/${gn.note_id}/summary/${gn.id}`)}>
                          {gn.title}
                        </Text>
                        <Text size="xs" c="dimmed">
                           Generated on {formatNoteDate(gn.created_at)}
                        </Text>
                      </Box>
                      <Button variant="light" size="sm" onClick={() => navigate(`/note/${gn.note_id}/summary/${gn.id}`)}>
                        View Note
                      </Button>
                   </Group>
                </Card>
              ))}
            </Stack>
          ) : (
            <Center h={200}>
              <Text c="dimmed">No generated notes found.</Text>
            </Center>
          )}
        </Tabs.Panel>
      </Tabs>

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

      <Modal opened={reprocessNoteModalOpened} onClose={closeReprocessNoteModal} title="Reprocess Note" centered>
        <Text size="sm" mb="lg">
          Are you sure you want to reprocess <b>{reprocessingNote?.title}</b>? This will extract all content from the file again, completely replacing the current extraction and embeddings. Existing summaries will be kept. This operation might take a while.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={closeReprocessNoteModal} disabled={submitting}>Cancel</Button>
          <Button leftSection={<IconRefresh size={16} />} onClick={executeReprocessNote} loading={submitting}>Reprocess</Button>
        </Group>
      </Modal>

      <Modal opened={!!infoModalNote} onClose={() => setInfoModalNote(null)} title="System Information" centered size="lg">
        {infoModalNote && (
          <Stack gap="sm">
            <Group justify="space-between">
              <Text size="sm" fw={500}>Note ID</Text>
              <Code>{infoModalNote.id}</Code>
            </Group>
            <Group justify="space-between">
              <Text size="sm" fw={500}>Created</Text>
              <Text size="sm">{new Date(infoModalNote.created_at).toLocaleString()}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" fw={500}>Uploaded</Text>
              <Text size="sm">{new Date(infoModalNote.created_at).toLocaleString()}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" fw={500}>Processing</Text>
              <Text size="sm">{new Date(infoModalNote.updated_at).toLocaleString()}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" fw={500}>File Name</Text>
              <Anchor 
                size="sm" 
                onClick={() => handleDownload(infoModalNote.id, infoModalNote.file_name)}
                style={{ cursor: 'pointer' }}
              >
                {infoModalNote.file_name || 'Download File'}
              </Anchor>
            </Group>
            <Group justify="space-between">
              <Text size="sm" fw={500}>File Type</Text>
              <Text size="sm">{infoModalNote.file_type || 'Unknown'}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" fw={500}>File Size</Text>
              <Text size="sm">
                {infoModalNote.file_size ? `${(infoModalNote.file_size / 1024 / 1024).toFixed(2)} MB` : 'Unknown'}
              </Text>
            </Group>
            {infoModalNote.page_count > 0 && (
              <Group justify="space-between">
                <Text size="sm" fw={500}>Page Count</Text>
                <Text size="sm">{infoModalNote.page_count}</Text>
              </Group>
            )}
            
            {infoModalNote.timings ? (
              <>
                <Text size="sm" fw={700} mt="md">Processing Timings</Text>
                {infoModalNote.timings.local_extraction && (
                  <Group justify="space-between">
                    <Text size="sm" fw={500}>Local Extraction</Text>
                    <Text size="sm" c="dimmed">{infoModalNote.timings.local_extraction.toFixed(2)}s</Text>
                  </Group>
                )}
                {infoModalNote.timings.ai_polish_total && (
                  <Group justify="space-between">
                    <Text size="sm" fw={500}>AI Polish (Total)</Text>
                    <Text size="sm" c="dimmed">{infoModalNote.timings.ai_polish_total.toFixed(2)}s</Text>
                  </Group>
                )}
                
                {/* Find chunk timings dynamically */}
                {Object.keys(infoModalNote.timings)
                  .filter(k => k.startsWith("chunk_"))
                  .sort()
                  .map(k => (
                  <Group key={k} justify="space-between" pl="md">
                    <Text size="xs" fw={500}>- {k.replace('chunk_', 'Chunk ')}</Text>
                    <Text size="xs" c="dimmed">{infoModalNote.timings[k].toFixed(2)}s</Text>
                  </Group>
                ))}

                {infoModalNote.timings.total_pipeline && (
                  <Group justify="space-between">
                    <Text size="sm" fw={500}>Total Pipeline Time</Text>
                    <Text size="sm" c="dimmed">{infoModalNote.timings.total_pipeline.toFixed(2)}s</Text>
                  </Group>
                )}
              </>
            ) : (
              <Text size="sm" c="dimmed" mt="md">No detailed timings available for this note.</Text>
            )}

            {infoModalNote.processing_time_ms && (
              <Group justify="space-between" mt="xs">
                <Text size="sm" fw={500}>Total Request Processing Time</Text>
                <Text size="sm" c="dimmed">{(infoModalNote.processing_time_ms / 1000).toFixed(2)}s</Text>
              </Group>
            )}
          </Stack>
        )}
      </Modal>
    </Box>
  );
}
