import { useState, useEffect } from 'react';
import { Box, Title, Tabs, Paper, Select, MultiSelect, NumberInput, Button, Radio, Stack, Text, Group, Progress, Loader, Center, SimpleGrid, Card, Modal, TextInput, FileInput, Checkbox, Textarea, ActionIcon, Menu } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconBolt, IconSearch, IconPlus, IconCards, IconTrophy, IconArrowsSort, IconFileImport, IconEdit, IconTrash, IconDotsVertical } from '@tabler/icons-react';
import { fetchApi } from '../lib/api';
import GenerateQuizModal from '../components/GenerateQuizModal';

export default function QuizSystem() {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('date_desc');

  // Generate Quiz Modal
  const [quizGroups, setQuizGroups] = useState([]);
  
  // Generate Quiz Modal
  const [opened, { open, close }] = useDisclosure(false);
  const [selectedQuizGroup, setSelectedQuizGroup] = useState(null);

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
      closeCreateQuizGroup();
      setNewQuizGroupName('');
    } catch(err) {
      console.error("Failed to create quiz group");
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
      console.error("Failed to update quiz group");
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
      console.error("Failed to delete quiz group");
    } finally {
      setDeletingGroup(false);
    }
  };

  // Take Quiz State
  const [takingQuiz, setTakingQuiz] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});

  useEffect(() => {
    const loadData = async () => {
      try {
        const [quizzesData, quizGroupsData] = await Promise.all([
          fetchApi('/quizzes').catch(() => []),
          fetchApi('/quizzes/groups').catch(() => [])
        ]);
        setQuizzes(quizzesData || []);
        setQuizGroups(quizGroupsData || []);
      } catch (err) {
        console.error("Failed to load quizzes", err);
      } finally {
        setLoading(false);
      }
      
      // Check query params for actions
      const params = new URLSearchParams(window.location.search);
      if (params.get('generate') === 'true') {
        const groupId = params.get('group');
        if (groupId) {
          setSelectedQuizGroup(groupId);
        }
        open();
        // Clean up URL
        window.history.replaceState({}, '', '/quiz');
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

  const handleGenerateSuccess = (newQuiz) => {
    setQuizzes(prev => [newQuiz, ...prev]);
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
      ) : quizzes.length === 0 && quizGroups.length === 0 ? (
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
                onClick={() => window.location.href = `/quiz/group/${group.id}`}
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
          
          {(groupedQuizzes['ungrouped'] && groupedQuizzes['ungrouped'].length > 0) && (
            <Card 
              key="ungrouped" 
              shadow="sm" 
              padding="lg" 
              radius="md" 
              withBorder
              onClick={() => window.location.href = `/quiz/group/ungrouped`}
              style={{ cursor: 'pointer', transition: 'transform 150ms ease', '&:hover': { transform: 'translateY(-2px)' } }}
            >
              <Group justify="space-between" mb="xs">
                <Title order={3} fw={700} c="#171738" style={{ fontFamily: 'Instrument Sans, sans-serif' }}>
                  Ungrouped Quizzes
                </Title>
              </Group>
              <Text size="sm" c="dimmed" mb="lg">
                {groupedQuizzes['ungrouped'] ? groupedQuizzes['ungrouped'].length : 0} Quizzes inside
              </Text>
            </Card>
          )}
        </SimpleGrid>
      )}
      <GenerateQuizModal 
        opened={opened}
        onClose={close}
        onSuccess={handleGenerateSuccess}
        initialQuizGroupId={selectedQuizGroup}
      />

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
      <Modal opened={deleteGroupOpened} onClose={closeDeleteGroup} title="Delete Quiz Group" size="sm" zIndex={2000} centered>
          <Text size="sm" mb="md">
            Are you sure you want to delete this group? This will permanently remove all associated quizzes.
          </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={closeDeleteGroup}>Cancel</Button>
          <Button color="red" onClick={handleDeleteQuizGroup} loading={deletingGroup}>Delete</Button>
        </Group>
      </Modal>
    </Box>
  );
}
