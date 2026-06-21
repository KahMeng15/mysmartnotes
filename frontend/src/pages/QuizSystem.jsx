import { useState, useEffect } from 'react';
import { Box, Title, Tabs, Paper, Select, MultiSelect, NumberInput, Button, Radio, Stack, Text, Group, Progress, Loader, Center, SimpleGrid, Card, Modal, TextInput, FileInput, Checkbox, Textarea, ActionIcon, Menu } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconBolt, IconSearch, IconPlus, IconCards, IconTrophy, IconArrowsSort, IconFileImport, IconEdit, IconTrash, IconDotsVertical } from '@tabler/icons-react';
import { fetchApi } from '../lib/api';

export default function QuizSystem() {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('date_desc');

  // Generate Quiz Modal
  const [opened, { open, close }] = useDisclosure(false);
  const [groups, setGroups] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [notes, setNotes] = useState([]);
  const [quizGroups, setQuizGroups] = useState([]);

  const [quizTitle, setQuizTitle] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedNote, setSelectedNote] = useState('');
  const [selectedQuizGroup, setSelectedQuizGroup] = useState('');
  
  const [questionTypes, setQuestionTypes] = useState(['mixed']);
  const [numQuestions, setNumQuestions] = useState(5);
  
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  // Import States
  const [importText, setImportText] = useState('');
  const [importFiles, setImportFiles] = useState([]);
  const [generateAnswers, setGenerateAnswers] = useState(true);
  const [importing, setImporting] = useState(false);

  const [createQuizGroupOpened, { open: openCreateQuizGroup, close: closeCreateQuizGroup }] = useDisclosure(false);
  const [newQuizGroupName, setNewQuizGroupName] = useState('');
  const [creatingQuizGroup, setCreatingQuizGroup] = useState(false);

  // Edit / Delete Group States
  const [groupToEdit, setGroupToEdit] = useState(null);
  const [editGroupOpened, { open: openEditGroup, close: closeEditGroup }] = useDisclosure(false);
  const [editingGroup, setEditingGroup] = useState(false);

  const [groupToDelete, setGroupToDelete] = useState(null);
  const [deleteGroupOpened, { open: openDeleteGroup, close: closeDeleteGroup }] = useDisclosure(false);
  const [deletingGroup, setDeletingGroup] = useState(false);

  const handleCreateQuizGroup = async () => {
    if (!newQuizGroupName.trim()) return;
    setCreatingQuizGroup(true);
    try {
      const response = await fetchApi('/quizzes/groups', {
        method: 'POST',
        body: JSON.stringify({ name: newQuizGroupName.trim() })
      });
      setQuizGroups(prev => [...prev, response]);
      setSelectedQuizGroup(response.id.toString());
      closeCreateQuizGroup();
      setNewQuizGroupName('');
    } catch(err) {
      setError("Failed to create quiz group");
    } finally {
      setCreatingQuizGroup(false);
    }
  };

  const handleEditQuizGroup = async () => {
    if (!newQuizGroupName.trim() || !groupToEdit) return;
    setEditingGroup(true);
    try {
      const response = await fetchApi(`/quizzes/groups/${groupToEdit.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: newQuizGroupName.trim() })
      });
      setQuizGroups(prev => prev.map(g => g.id === groupToEdit.id ? response : g));
      closeEditGroup();
    } catch(err) {
      setError("Failed to update quiz group");
    } finally {
      setEditingGroup(false);
    }
  };

  const handleDeleteQuizGroup = async () => {
    if (!groupToDelete) return;
    setDeletingGroup(true);
    try {
      await fetchApi(`/quizzes/groups/${groupToDelete.id}`, {
        method: 'DELETE'
      });
      setQuizGroups(prev => prev.filter(g => g.id !== groupToDelete.id));
      setQuizzes(prev => prev.map(q => q.quiz_group_id === groupToDelete.id ? { ...q, quiz_group_id: null } : q));
      closeDeleteGroup();
    } catch(err) {
      setError("Failed to delete quiz group");
    } finally {
      setDeletingGroup(false);
    }
  };

  const handleQuestionTypeChange = (values) => {
    if (values.length === 0) {
      setQuestionTypes([]);
      return;
    }
    const hasMixed = values.includes('mixed');
    const prevHadMixed = questionTypes.includes('mixed');
    
    if (hasMixed && !prevHadMixed) {
      setQuestionTypes(['mixed']);
    } else if (hasMixed && values.length > 1) {
      setQuestionTypes(values.filter(v => v !== 'mixed'));
    } else {
      setQuestionTypes(values);
    }
  };

  const handleImportQuiz = async () => {
    if (!importText.trim() && importFiles.length === 0) {
      setError("Please provide either text or file(s) to import.");
      return;
    }
    setImporting(true);
    setError(null);
    const formData = new FormData();
    if (quizTitle.trim()) formData.append('title', quizTitle.trim());
    if (importText.trim()) formData.append('text', importText.trim());
    if (selectedQuizGroup) formData.append('quiz_group_id', selectedQuizGroup);
    formData.append('generate_answers', generateAnswers);
    importFiles.forEach(file => formData.append('file', file));

    try {
      const response = await fetchApi('/quizzes/import', {
        method: 'POST',
        body: formData,
        headers: {} // Required to let browser set boundary
      });
      setQuizzes(prev => [response, ...prev]);
      close();
    } catch (err) {
      setError(err.message || 'Failed to import quiz');
    } finally {
      setImporting(false);
    }
  };

  // Take Quiz State
  const [takingQuiz, setTakingQuiz] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});

  useEffect(() => {
    const loadData = async () => {
      try {
        const [quizzesData, subjectsData, groupsData, notesData, quizGroupsData] = await Promise.all([
          fetchApi('/quizzes').catch(() => []),
          fetchApi('/subjects').catch(() => []),
          fetchApi('/groups').catch(() => []),
          fetchApi('/notes').catch(() => []),
          fetchApi('/quizzes/groups').catch(() => [])
        ]);
        setQuizzes(quizzesData || []);
        setSubjects(subjectsData || []);
        setGroups(groupsData || []);
        setNotes(notesData || []);
        setQuizGroups(quizGroupsData || []);
      } catch (err) {
        console.error("Failed to load quizzes", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const processedQuizzes = quizzes
    .filter(quiz => quiz.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'name_asc') return a.title.localeCompare(b.title);
      if (sort === 'name_desc') return b.title.localeCompare(a.title);
      if (sort === 'date_desc') return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      if (sort === 'date_asc') return new Date(a.created_at || 0) - new Date(b.created_at || 0);
      return 0;
    });

  const handleGenerateQuiz = async () => {
    let scopeType = '';
    let scopeId = '';

    if (selectedNote && selectedNote !== 'all') {
      scopeType = 'note';
      scopeId = selectedNote;
    } else if (selectedSubject && selectedSubject !== 'all') {
      scopeType = 'subject';
      scopeId = selectedSubject;
    } else if (selectedGroup && selectedGroup !== 'ungrouped' && selectedGroup !== 'all') {
      scopeType = 'group';
      scopeId = selectedGroup;
    } else {
      setError("Please select a group, subject or note to test.");
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const response = await fetchApi('/quizzes/generate', {
        method: 'POST',
        body: JSON.stringify({
          title: quizTitle.trim(),
          scope_type: scopeType,
          scope_id: scopeId,
          question_types: questionTypes.length > 0 ? questionTypes : ['mixed'],
          number_of_questions: numQuestions,
          quiz_group_id: selectedQuizGroup || null
        })
      });

      // Update local quiz list with a dummy pending item
      setQuizzes(prev => [
        { 
          id: response.quiz_id || response.task_id, 
          title: quizTitle.trim() || 'Generating AI Quiz...', 
          created_at: new Date().toISOString(), 
          questions: [],
          quiz_group_id: selectedQuizGroup || null,
          model: 'Generating...'
        }, 
        ...prev
      ]);
      close();
    } catch (err) {
      setError(err.message || 'Failed to generate quiz');
    } finally {
      setGenerating(false);
    }
  };

  const startTakingQuiz = (quiz) => {
    setTakingQuiz(quiz);
    setCurrentQuestionIndex(0);
    setSelectedAnswers({});
  };

  if (takingQuiz) {
    const question = takingQuiz.questions[currentQuestionIndex];
    const isLast = currentQuestionIndex === takingQuiz.questions.length - 1;

    return (
      <Box maxWidth={800} mx="auto" pt="xl">
        <Button variant="subtle" mb="md" onClick={() => setTakingQuiz(null)}>
          &larr; Exit Quiz
        </Button>
        <Paper withBorder p="xl" radius="md">
          <Progress 
            value={(currentQuestionIndex / takingQuiz.questions.length) * 100} 
            mb="xl" 
            size="lg"
            color="pink"
          />
          <Group justify="space-between" mb="lg">
            <Title order={3}>Question {currentQuestionIndex + 1} of {takingQuiz.questions.length}</Title>
            <Text c="dimmed">{takingQuiz.title}</Text>
          </Group>

          <Text size="xl" mb="xl" fw={500}>{question.question_text}</Text>

          <Radio.Group
            value={selectedAnswers[question.id] || ''}
            onChange={(val) => setSelectedAnswers({...selectedAnswers, [question.id]: val})}
          >
            <Stack>
              {question.options.map((opt, i) => (
                <Radio key={i} value={opt} label={<Text size="lg">{opt}</Text>} size="md" />
              ))}
            </Stack>
          </Radio.Group>

          <Group justify="flex-end" mt="xl">
            <Button 
              variant="default" 
              onClick={() => setCurrentQuestionIndex(c => c - 1)} 
              disabled={currentQuestionIndex === 0}
            >
              Previous
            </Button>
            {isLast ? (
              <Button color="pink" onClick={() => {
                alert("Quiz submitted! (Mocked)");
                setTakingQuiz(null);
              }}>
                Submit Quiz
              </Button>
            ) : (
              <Button color="pink" onClick={() => setCurrentQuestionIndex(c => c + 1)}>
                Next Question
              </Button>
            )}
          </Group>
        </Paper>
      </Box>
    );
  }

  // Group quizzes by quiz_group_id
  const groupedQuizzes = {};
  processedQuizzes.forEach(quiz => {
    const groupId = quiz.quiz_group_id || 'ungrouped';
    if (!groupedQuizzes[groupId]) {
      groupedQuizzes[groupId] = [];
    }
    groupedQuizzes[groupId].push(quiz);
  });

  return (
    <Box>
      <Group justify="space-between" mb="xl">
        <Box>
          <Title order={1} fw={800} style={{ fontFamily: 'Instrument Sans, sans-serif', color: '#171738' }}>My Quizzes</Title>
        </Box>
        <Group>
          <Button variant="light" color="pink" leftSection={<IconPlus size={16} />} onClick={() => { setNewQuizGroupName(''); openCreateQuizGroup(); }}>
            Create Quiz Group
          </Button>
          <Button color="pink" leftSection={<IconPlus size={16} />} onClick={open}>
            Generate Quiz
          </Button>
        </Group>
      </Group>

      {/* Controls */}
      <Group mb="xl" align="flex-end">
        <TextInput
          placeholder="Search quizzes..."
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          style={{ flexGrow: 1 }}
        />
        <Select
          value={sort}
          onChange={setSort}
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

      {/* Quizzes Grid */}
      {loading ? (
        <Center h={200}>
          <Stack align="center">
            <Loader color="pink" />
            <Text c="dimmed">Loading your quizzes...</Text>
          </Stack>
        </Center>
      ) : quizzes.length === 0 ? (
        <Paper withBorder p={60} radius="md">
          <Center>
            <Stack align="center" spacing="sm">
              <IconTrophy size={48} color="var(--mantine-color-pink-3)" />
              <Text size="lg" fw={500}>No Quizzes Yet</Text>
              <Text c="dimmed" ta="center" maw={400}>
                Generate AI quizzes from your study notes to test your knowledge and prepare for exams.
              </Text>
              <Button color="pink" mt="md" onClick={open}>
                Generate First Quiz
              </Button>
            </Stack>
          </Center>
        </Paper>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
          {quizGroups.map(group => {
            const groupQuizzes = groupedQuizzes[group.id] || [];
            return (
              <Card 
                key={group.id} 
                shadow="sm" 
                padding="lg" 
                radius="md" 
                withBorder
                onClick={() => window.location.href = `/quiz-group/${group.id}`}
                style={{ cursor: 'pointer', transition: 'transform 150ms ease', '&:hover': { transform: 'translateY(-2px)' } }}
              >
                <Group justify="space-between" wrap="nowrap" mb="xs">
                  <Title order={3} fw={700} c="#171738" style={{ fontFamily: 'Instrument Sans, sans-serif', flexGrow: 1 }}>
                    {group.name}
                  </Title>
                  <Menu shadow="md" width={150}>
                    <Menu.Target>
                      <ActionIcon variant="subtle" color="gray" onClick={(e) => e.stopPropagation()}>
                        <IconDotsVertical size={18} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item 
                        leftSection={<IconEdit size={14} />}
                        onClick={(e) => { e.stopPropagation(); setGroupToEdit(group); setNewQuizGroupName(group.name); openEditGroup(); }}
                      >
                        Edit Group
                      </Menu.Item>
                      <Menu.Item 
                        color="red" 
                        leftSection={<IconTrash size={14} />}
                        onClick={(e) => { e.stopPropagation(); setGroupToDelete(group); openDeleteGroup(); }}
                      >
                        Delete Group
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Group>
                <Text size="sm" c="dimmed" mb="lg">
                  {groupQuizzes.length} Quizzes inside
                </Text>
              </Card>
            );
          })}
          
          <Card 
            key="ungrouped" 
            shadow="sm" 
            padding="lg" 
            radius="md" 
            withBorder
            onClick={() => window.location.href = `/quiz-group/ungrouped`}
            style={{ cursor: 'pointer', transition: 'transform 150ms ease', '&:hover': { transform: 'translateY(-2px)' } }}
          >
            <Group justify="space-between" wrap="nowrap" mb="xs">
              <Title order={3} fw={700} c="#171738" style={{ fontFamily: 'Instrument Sans, sans-serif' }}>
                Ungrouped Quizzes
              </Title>
              <IconCards size={20} color="var(--mantine-color-pink-6)" />
            </Group>
            <Text size="sm" c="dimmed" mb="lg">
              {(groupedQuizzes['ungrouped'] || []).length} Quizzes inside
            </Text>
          </Card>
        </SimpleGrid>
      )}

      {/* Generate Quiz Modal */}
      <Modal opened={opened} onClose={close} title="Create Quiz" centered size="lg">
        {error && <Text color="red" size="sm" mb="sm">{error}</Text>}
        <Tabs defaultValue="generate">
          <Tabs.List mb="md">
            <Tabs.Tab value="generate" leftSection={<IconBolt size={14} />}>Generate AI Quiz</Tabs.Tab>
            <Tabs.Tab value="import" leftSection={<IconFileImport size={14} />}>Import Quiz</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="generate">
            <Stack spacing="md">
              <Paper withBorder p="sm" radius="md">
                <Text size="sm" fw={500} mb="xs">Quiz Info</Text>
                <Stack spacing="sm">
                  <TextInput
                    label="Quiz Title (Optional)"
                    placeholder="Leave blank to auto-generate"
                    value={quizTitle}
                    onChange={(e) => setQuizTitle(e.currentTarget.value)}
                    data-autofocus
                  />
                  <Select
                    label="Save to Quiz Group (Optional)"
                    placeholder="Select a quiz group"
                    data={[
                      { value: 'new', label: '+ Create New Quiz Group' },
                      ...quizGroups.map(qg => ({ value: qg.id.toString(), label: qg.name }))
                    ]}
                    value={selectedQuizGroup}
                    onChange={(val) => {
                      if (val === 'new') {
                        openCreateQuizGroup();
                        return;
                      }
                      setSelectedQuizGroup(val);
                    }}
                    clearable
                  />
                </Stack>
              </Paper>

              <Paper withBorder p="sm" radius="md">
                <Text size="sm" fw={500} mb="xs">Quiz Context</Text>
                <Stack spacing="sm">
                  <Select
                    label="Select Group"
                    placeholder="Choose group"
                    data={groups
                      .map(g => ({ value: g.id.toString(), label: g.name }))
                      .sort((a, b) => a.label.localeCompare(b.label))
                    }
                    value={selectedGroup}
                    onChange={(val) => {
                      setSelectedGroup(val);
                      setSelectedSubject('');
                      setSelectedNote('');
                    }}
                  />
                  <Select
                    label="Select Subject"
                    placeholder="Whole Group or pick a Subject"
                    data={[
                      { value: 'all', label: 'Whole Group (All Subjects)' },
                      ...subjects
                         .filter(s => s.group_id?.toString() === selectedGroup)
                         .map(s => ({ value: s.id.toString(), label: s.name }))
                         .sort((a, b) => a.label.localeCompare(b.label))
                    ]}
                    value={selectedSubject}
                    onChange={(val) => {
                      setSelectedSubject(val);
                      setSelectedNote('');
                    }}
                    disabled={!selectedGroup}
                  />
                  <Select
                    label="Select Note"
                    placeholder="Whole Subject or pick a Note"
                    data={[
                      { value: 'all', label: 'Whole Subject (All Notes)' },
                      ...notes
                         .filter(n => n.subject_id?.toString() === selectedSubject)
                         .map(n => ({ value: n.id.toString(), label: n.title }))
                         .sort((a, b) => a.label.localeCompare(b.label))
                    ]}
                    value={selectedNote}
                    onChange={setSelectedNote}
                    disabled={!selectedSubject || selectedSubject === 'all'}
                  />
                </Stack>
              </Paper>

              <Paper withBorder p="sm" radius="md">
                <Text size="sm" fw={500} mb="xs">Question Parameters</Text>
                <Stack spacing="sm">
                  <MultiSelect
                    label="Question Types"
                    placeholder="Select types"
                    data={[
                      { value: 'mixed', label: 'Mixed' },
                      { value: 'objective', label: 'Multiple Choice' },
                      { value: 'subjective', label: 'Short Answer' },
                      { value: 'fill_in_the_blank', label: 'Fill in the Blank' },
                    ]}
                    value={questionTypes}
                    onChange={handleQuestionTypeChange}
                    clearable
                  />
                  <NumberInput
                    label="Number of Questions"
                    value={numQuestions}
                    onChange={setNumQuestions}
                    min={1}
                    max={50}
                  />
                </Stack>
              </Paper>

              <Button mt="md" fullWidth color="pink" onClick={handleGenerateQuiz} loading={generating} leftSection={<IconBolt size={16} />}>
                {generating ? 'Generating AI Quiz...' : 'Generate Quiz'}
              </Button>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="import">
            <Stack spacing="md">
              <Paper withBorder p="sm" radius="md">
                <Text size="sm" fw={500} mb="xs">Quiz Info</Text>
                <Stack spacing="sm">
                  <TextInput
                    label="Quiz Title (Optional)"
                    placeholder="E.g. Biology Notes Quiz"
                    value={quizTitle}
                    onChange={(e) => setQuizTitle(e.currentTarget.value)}
                  />
                  <Select
                    label="Save to Quiz Group (Optional)"
                    placeholder="Select a quiz group"
                    data={[
                      { value: 'new', label: '+ Create New Quiz Group' },
                      ...quizGroups.map(qg => ({ value: qg.id.toString(), label: qg.name }))
                    ]}
                    value={selectedQuizGroup}
                    onChange={(val) => {
                      if (val === 'new') {
                        openCreateQuizGroup();
                        return;
                      }
                      setSelectedQuizGroup(val);
                    }}
                    clearable
                  />
                </Stack>
              </Paper>

              <Paper withBorder p="sm" radius="md">
                <Text size="sm" fw={500} mb="xs">Import Source</Text>
                <Stack spacing="sm">
                  <Textarea
                    label="Paste Text Content"
                    placeholder="Paste your questions and answers here..."
                    minRows={4}
                    value={importText}
                    onChange={(e) => setImportText(e.currentTarget.value)}
                  />
                  <FileInput
                    label="Upload Files (PDF, PPTX, Images)"
                    placeholder="Select files"
                    multiple
                    value={importFiles}
                    onChange={setImportFiles}
                  />
                  <Checkbox
                    label="Generate Missing Answers via AI"
                    checked={generateAnswers}
                    onChange={(event) => setGenerateAnswers(event.currentTarget.checked)}
                    mt="sm"
                  />
                </Stack>
              </Paper>

              <Button mt="md" fullWidth color="pink" onClick={handleImportQuiz} loading={importing} leftSection={<IconFileImport size={16} />}>
                {importing ? 'Importing Quiz...' : 'Import Quiz'}
              </Button>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Modal>

      {/* Create Quiz Group Modal */}
      <Modal opened={createQuizGroupOpened} onClose={closeCreateQuizGroup} title="Create Quiz Group" size="sm">
        <Stack spacing="sm">
          <TextInput
            label="Group Name"
            placeholder="e.g., Final Exams 2026"
            value={newQuizGroupName}
            onChange={(e) => setNewQuizGroupName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateQuizGroup()}
            data-autofocus
          />
          <Button onClick={handleCreateQuizGroup} loading={creatingQuizGroup} color="pink">Create Quiz Group</Button>
        </Stack>
      </Modal>

      {/* Edit Group Modal */}
      <Modal opened={editGroupOpened} onClose={closeEditGroup} title="Edit Quiz Group" size="sm" zIndex={2000}>
        <Stack spacing="sm">
          <TextInput
            label="Group Name"
            placeholder="e.g., Final Exams 2026"
            value={newQuizGroupName}
            onChange={(e) => setNewQuizGroupName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleEditQuizGroup()}
            data-autofocus
          />
          <Button onClick={handleEditQuizGroup} loading={editingGroup} color="pink">Save Changes</Button>
        </Stack>
      </Modal>

      {/* Delete Group Modal */}
      <Modal opened={deleteGroupOpened} onClose={closeDeleteGroup} title="Delete Quiz Group" size="sm" zIndex={2000}>
        <Text size="sm" mb="md">
          Are you sure you want to delete this group? Quizzes inside this group will NOT be deleted, they will just become ungrouped.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={closeDeleteGroup}>Cancel</Button>
          <Button color="red" onClick={handleDeleteQuizGroup} loading={deletingGroup}>Delete</Button>
        </Group>
      </Modal>
    </Box>
  );
}
