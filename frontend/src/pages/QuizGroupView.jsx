import { useState, useEffect, useMemo } from 'react';
import { Box, Title, Text, Group, Card, Button, ActionIcon, Center, Loader, SimpleGrid, TextInput, Modal, Select, Progress, Paper, Radio, Checkbox, Stack, Badge, Menu } from '@mantine/core';
import { IconChevronLeft, IconCards, IconSearch, IconArrowsSort, IconTrophy, IconDotsVertical, IconPencil, IconTrash, IconInfoCircle, IconX, IconPlus } from '@tabler/icons-react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDisclosure } from '@mantine/hooks';
import { fetchApi } from '../lib/api';
import GenerateQuizModal from '../components/GenerateQuizModal';

export default function QuizGroupView() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [group, setGroup] = useState(null);
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('date_desc');
  
  // Task polling for generating quizzes
  const [activeTasks, setActiveTasks] = useState([]);

  // Take Quiz State
  const [takingQuiz, setTakingQuiz] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});

  // Generate Quiz Modal
  const [generateOpened, { open: openGenerate, close: closeGenerate }] = useDisclosure(false);

  const handleGenerateSuccess = (newQuiz) => {
    setQuizzes(prev => [newQuiz, ...prev]);
  };

  // Menu Action States
  const [submitting, setSubmitting] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [renameModalOpened, setRenameModalOpened] = useState(false);
  const [deleteQuizModalOpened, setDeleteQuizModalOpened] = useState(false);
  const [quizToDelete, setQuizToDelete] = useState(null);
  const [infoModalQuiz, setInfoModalQuiz] = useState(null);

  const openRename = (quiz) => {
    setEditingQuiz(quiz);
    setNewTitle(quiz.title);
    setRenameModalOpened(true);
  };

  const openDelete = (quiz) => {
    setQuizToDelete(quiz);
    setDeleteQuizModalOpened(true);
  };

  const handleRename = async () => {
    if (!newTitle.trim() || !editingQuiz) return;
    setSubmitting(true);
    try {
      await fetchApi(`/quizzes/${editingQuiz.id}`, {
        method: 'PUT',
        body: JSON.stringify({ title: newTitle.trim() })
      });
      setQuizzes(quizzes.map(q => q.id === editingQuiz.id ? { ...q, title: newTitle.trim() } : q));
      setRenameModalOpened(false);
    } catch (err) {
      alert("Failed to rename quiz: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const executeDeleteQuiz = async () => {
    if (!quizToDelete) return;
    setSubmitting(true);
    try {
      await fetchApi(`/quizzes/${quizToDelete.id}`, { method: 'DELETE' });
      setQuizzes(quizzes.filter(q => q.id !== quizToDelete.id));
      setDeleteQuizModalOpened(false);
    } catch (err) {
      alert("Failed to delete quiz: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelGeneration = async (quiz, taskId) => {
    try {
      if (taskId) {
        await fetchApi(`/search/tasks/${taskId}/cancel`, { method: 'POST' });
      }
      await fetchApi(`/quizzes/${quiz.id}`, { method: 'DELETE' });
      setQuizzes(quizzes => quizzes.filter(q => q.id !== quiz.id));
    } catch (err) {
      alert("Failed to cancel generation: " + err.message);
    }
  };

  const loadData = async () => {
    try {
      const [groupsData, allQuizzes] = await Promise.all([
        fetchApi('/quizzes/groups'),
        fetchApi('/quizzes')
      ]);
      
      let currentGroup;
      if (id === 'ungrouped') {
        currentGroup = { id: 'ungrouped', name: 'Ungrouped Quizzes' };
      } else {
        currentGroup = (groupsData || []).find(g => g.id.toString() === id);
      }
      setGroup(currentGroup);
      
      if (id === 'ungrouped') {
        setQuizzes((allQuizzes || []).filter(q => !q.quiz_group_id));
      } else {
        setQuizzes((allQuizzes || []).filter(q => q.quiz_group_id?.toString() === id));
      }
    } catch (err) {
      console.error("Failed to load quiz group data", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveTasks = async () => {
    try {
      const data = await fetchApi('/search/tasks/active');
      if (data && data.tasks) {
        const quizTasks = data.tasks.filter(t => t.type === 'quiz_generation');
        setActiveTasks(quizTasks);
        
        // If there are pending quizzes that now finished, reload quizzes
        // We do this if we see a quiz in 'quizzes' that has model="Generating..." 
        // but no corresponding active task anymore.
        setQuizzes(prev => {
          let needsReload = false;
          prev.forEach(q => {
            if (q.model === 'Generating...') {
              const stillActive = quizTasks.some(t => t.task_id === `quiz_${q.id}` || (t.kwargs && t.kwargs.quiz_id === q.id));
              if (!stillActive) needsReload = true;
            }
          });
          if (needsReload) setTimeout(loadData, 500);
          return prev;
        });
      }
    } catch(err) {
      console.error("Failed to fetch active tasks", err);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  useEffect(() => {
    fetchActiveTasks();
    const interval = setInterval(fetchActiveTasks, 3000);
    return () => clearInterval(interval);
  }, []);

  const filteredQuizzes = useMemo(() => {
    let result = [...quizzes];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(quiz => quiz.title.toLowerCase().includes(q));
    }
    
    result.sort((a, b) => {
      if (sort === 'name_asc') return a.title.localeCompare(b.title);
      if (sort === 'name_desc') return b.title.localeCompare(a.title);
      if (sort === 'date_desc') return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      if (sort === 'date_asc') return new Date(a.created_at || 0) - new Date(b.created_at || 0);
      return 0;
    });
    
    return result;
  }, [quizzes, search, sort]);

  const startTakingQuiz = (quiz) => {
    setTakingQuiz(quiz);
    setCurrentQuestionIndex(0);
    setSelectedAnswers({});
  };

  const handleSelectAnswer = (qId, optionIdx, isMultiple) => {
    setSelectedAnswers(prev => {
      if (isMultiple) {
        const existing = prev[qId] || [];
        if (existing.includes(optionIdx)) {
          return { ...prev, [qId]: existing.filter(idx => idx !== optionIdx) };
        } else {
          return { ...prev, [qId]: [...existing, optionIdx] };
        }
      } else {
        return { ...prev, [qId]: optionIdx };
      }
    });
  };

  if (loading) {
    return (
      <Center h="50vh">
        <Loader size="lg" color="pink" />
      </Center>
    );
  }

  if (!group) {
    return (
      <Center h="50vh">
        <Text c="dimmed">Quiz group not found.</Text>
      </Center>
    );
  }

  return (
    <Box>
      <Box py="xs" px="md" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)', backgroundColor: '#fff', zIndex: 20, margin: '-16px -16px 20px -16px' }}>
        <Group justify="space-between">
          <Group>
            <ActionIcon variant="subtle" color="gray" onClick={() => navigate('/quiz')}>
              <IconChevronLeft size={20} />
            </ActionIcon>
            <Group gap="xs" ml="xs">
              <Text size="sm" fw={500} c="dimmed" style={{ cursor: 'pointer' }} onClick={() => navigate('/quiz')}>Quizzes</Text>
            </Group>
          </Group>
        </Group>
      </Box>

      <Group justify="space-between" mb="lg">
        <Box>
          <Title order={1}>{group.name}</Title>
          <Text c="dimmed">{quizzes.length} Quizzes</Text>
        </Box>
        <Button color="pink" leftSection={<IconPlus size={16} />} onClick={openGenerate}>
          Add Quiz
        </Button>
      </Group>

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

      {filteredQuizzes.length > 0 ? (
        <Stack spacing="sm">
          {filteredQuizzes.map((quiz) => {
            const isGenerating = quiz.model === 'Generating...';
            const activeTask = activeTasks.find(t => t.kwargs && t.kwargs.quiz_id === quiz.id);
            
            return (
              <Card key={quiz.id} shadow="sm" padding="md" radius="md" withBorder>
                <Group justify="space-between" wrap="nowrap">
                  <Box style={{ flex: 1 }}>
                    <Group gap="xs" mb={4}>
                      <Text fw={600} size="lg" c="#171738">{quiz.title}</Text>
                      {isGenerating && <Badge color="pink" variant="light" size="sm">Generating...</Badge>}
                    </Group>
                    
                    {isGenerating ? (
                      <Box mt="xs" w={{ base: '100%', sm: '300px' }}>
                        <Progress value={activeTask?.progress || 10} color="pink" striped animated size="sm" mb={4} />
                        <Text size="xs" c="dimmed">{activeTask?.message || "Initializing..."}</Text>
                      </Box>
                    ) : (
                      <Text size="sm" c="dimmed" mt={4}>
                        {quiz.questions?.length || 0} Questions • Created {new Date(quiz.created_at || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </Text>
                    )}
                  </Box>

                  <Group gap="xs">
                    <Button variant="light" color="pink" size="sm" onClick={() => startTakingQuiz(quiz)} disabled={isGenerating || !quiz.questions || quiz.questions.length === 0}>
                      Take Quiz
                    </Button>
                    <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                          <ActionIcon component="div" variant="subtle" color="gray">
                            <IconDotsVertical size={16} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          {isGenerating ? (
                            <Menu.Item color="red" leftSection={<IconX size={14} />} onClick={() => handleCancelGeneration(quiz, activeTask?.task_id)}>Cancel Generation</Menu.Item>
                          ) : (
                            <>
                              <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => openRename(quiz)}>Rename</Menu.Item>
                              <Menu.Item leftSection={<IconInfoCircle size={14} />} onClick={() => setInfoModalQuiz(quiz)}>System Info</Menu.Item>
                              <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => openDelete(quiz)}>Delete</Menu.Item>
                            </>
                          )}
                        </Menu.Dropdown>
                      </Menu>
                    </div>
                  </Group>
                </Group>
              </Card>
            );
          })}
        </Stack>
      ) : (
        <Center h={200}>
          <Box ta="center">
            <IconTrophy size={48} stroke={1.5} color="var(--mantine-color-pink-3)" />
            <Text c="dimmed" mt="sm">No quizzes found in this group.</Text>
          </Box>
        </Center>
      )}

      {/* Taking Quiz Modal */}
      {takingQuiz && (
        <Modal 
          opened={!!takingQuiz} 
          onClose={() => setTakingQuiz(null)}
          title={<Text fw={700} size="lg">{takingQuiz.title}</Text>}
          size="xl"
          fullScreen={false}
          styles={{ header: { paddingBottom: 0 }, body: { paddingTop: 20 } }}
        >
          {takingQuiz.questions && takingQuiz.questions.length > 0 && currentQuestionIndex < takingQuiz.questions.length ? (
            <Box>
              <Group justify="space-between" mb="md">
                <Text size="sm" fw={500} c="dimmed">Question {currentQuestionIndex + 1} of {takingQuiz.questions.length}</Text>
                <Badge color="pink" variant="light">{takingQuiz.questions[currentQuestionIndex].question_type}</Badge>
              </Group>
              <Progress value={((currentQuestionIndex) / takingQuiz.questions.length) * 100} mb="xl" color="pink" />
              
              <Paper withBorder p="xl" radius="md" mb="xl" bg="var(--mantine-color-gray-0)">
                <Text size="lg" fw={500} mb="xl">{takingQuiz.questions[currentQuestionIndex].question_text}</Text>
                
                {(takingQuiz.questions[currentQuestionIndex].question_type === 'mcq' || takingQuiz.questions[currentQuestionIndex].question_type === 'true_false') && takingQuiz.questions[currentQuestionIndex].options && (
                  <Stack spacing="sm">
                    {takingQuiz.questions[currentQuestionIndex].options.map((opt, idx) => (
                      <Paper 
                        key={idx} 
                        withBorder 
                        p="md" 
                        radius="md" 
                        style={{ 
                          cursor: 'pointer', 
                          backgroundColor: selectedAnswers[takingQuiz.questions[currentQuestionIndex].id] === idx ? 'var(--mantine-color-pink-0)' : 'white',
                          borderColor: selectedAnswers[takingQuiz.questions[currentQuestionIndex].id] === idx ? 'var(--mantine-color-pink-4)' : 'var(--mantine-color-gray-3)'
                        }}
                        onClick={() => handleSelectAnswer(takingQuiz.questions[currentQuestionIndex].id, idx, false)}
                      >
                        <Radio 
                          checked={selectedAnswers[takingQuiz.questions[currentQuestionIndex].id] === idx}
                          onChange={() => {}}
                          label={opt} 
                          color="pink"
                        />
                      </Paper>
                    ))}
                  </Stack>
                )}
                
                {takingQuiz.questions[currentQuestionIndex].question_type === 'multiple_select' && takingQuiz.questions[currentQuestionIndex].options && (
                  <Stack spacing="sm">
                    {takingQuiz.questions[currentQuestionIndex].options.map((opt, idx) => {
                      const isSelected = (selectedAnswers[takingQuiz.questions[currentQuestionIndex].id] || []).includes(idx);
                      return (
                        <Paper 
                          key={idx} 
                          withBorder 
                          p="md" 
                          radius="md" 
                          style={{ 
                            cursor: 'pointer', 
                            backgroundColor: isSelected ? 'var(--mantine-color-pink-0)' : 'white',
                            borderColor: isSelected ? 'var(--mantine-color-pink-4)' : 'var(--mantine-color-gray-3)'
                          }}
                          onClick={() => handleSelectAnswer(takingQuiz.questions[currentQuestionIndex].id, idx, true)}
                        >
                          <Checkbox 
                            checked={isSelected}
                            onChange={() => {}}
                            label={opt} 
                            color="pink"
                          />
                        </Paper>
                      );
                    })}
                  </Stack>
                )}

                {takingQuiz.questions[currentQuestionIndex].question_type === 'subjective' && (
                  <TextInput 
                    placeholder="Type your answer here..."
                    size="md"
                    value={selectedAnswers[takingQuiz.questions[currentQuestionIndex].id] || ''}
                    onChange={(e) => handleSelectAnswer(takingQuiz.questions[currentQuestionIndex].id, e.currentTarget.value, false)}
                  />
                )}
              </Paper>

              <Group justify="space-between">
                <Button variant="default" onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))} disabled={currentQuestionIndex === 0}>Previous</Button>
                {currentQuestionIndex === takingQuiz.questions.length - 1 ? (
                  <Button color="pink" onClick={() => {
                    alert("Quiz submitted! (Logic to be implemented)");
                    setTakingQuiz(null);
                  }}>Finish Quiz</Button>
                ) : (
                  <Button color="pink" onClick={() => setCurrentQuestionIndex(prev => Math.min(takingQuiz.questions.length - 1, prev + 1))}>Next</Button>
                )}
              </Group>
            </Box>
          ) : (
            <Center h={200}>
              <Text c="dimmed">This quiz has no questions.</Text>
            </Center>
          )}
        </Modal>
      )}

      {/* Modals */}
      <Modal opened={renameModalOpened} onClose={() => setRenameModalOpened(false)} title="Rename Quiz" centered>
        <form onSubmit={(e) => { e.preventDefault(); handleRename(); }}>
          <Stack>
            <TextInput label="Quiz Title" value={newTitle} onChange={(e) => setNewTitle(e.currentTarget.value)} data-autofocus />
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setRenameModalOpened(false)}>Cancel</Button>
              <Button type="submit" loading={submitting}>Save</Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal opened={deleteQuizModalOpened} onClose={() => setDeleteQuizModalOpened(false)} title="Confirm Delete" centered>
        <form onSubmit={(e) => { e.preventDefault(); executeDeleteQuiz(); }}>
          <Stack>
            <Text size="sm">Are you sure you want to delete the quiz <b>{quizToDelete?.title}</b>? This action cannot be undone.</Text>
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setDeleteQuizModalOpened(false)}>Cancel</Button>
              <Button type="submit" color="red" loading={submitting} data-autofocus>Delete Quiz</Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal opened={!!infoModalQuiz} onClose={() => setInfoModalQuiz(null)} title="Quiz Information" centered size="lg">
        {infoModalQuiz && (
          <Stack gap="sm">
            <Group justify="space-between">
              <Text size="sm" fw={500}>Quiz ID</Text>
              <Text size="sm" style={{ fontFamily: 'monospace' }}>{infoModalQuiz.id}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" fw={500}>Created</Text>
              <Text size="sm">{new Date(infoModalQuiz.created_at).toLocaleString()}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" fw={500}>Questions</Text>
              <Text size="sm">{infoModalQuiz.questions?.length || 0}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" fw={500}>AI Model</Text>
              <Badge color="pink" variant="light">{infoModalQuiz.model || 'Unknown'}</Badge>
            </Group>
            {infoModalQuiz.processing_time_ms && (
              <Group justify="space-between">
                <Text size="sm" fw={500}>Processing Time</Text>
                <Text size="sm" c="dimmed">{(infoModalQuiz.processing_time_ms / 1000).toFixed(2)}s</Text>
              </Group>
            )}
          </Stack>
        )}
      </Modal>

      <GenerateQuizModal 
        opened={generateOpened}
        onClose={closeGenerate}
        onSuccess={handleGenerateSuccess}
        initialQuizGroupId={id === 'ungrouped' ? null : id}
      />
    </Box>
  );
}
