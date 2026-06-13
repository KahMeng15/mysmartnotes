import { useState, useEffect } from 'react';
import { Box, Title, Tabs, Paper, Select, NumberInput, Button, Radio, Stack, Text, Group, Progress, Loader, Center, SimpleGrid, Card, Modal, TextInput } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconBolt, IconSearch, IconPlus, IconCards, IconTrophy } from '@tabler/icons-react';
import { fetchApi } from '../lib/api';

export default function QuizSystem() {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Generate Quiz Modal
  const [opened, { open, close }] = useDisclosure(false);
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [numQuestions, setNumQuestions] = useState(5);
  const [difficulty, setDifficulty] = useState('Medium');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  // Take Quiz State
  const [takingQuiz, setTakingQuiz] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});

  useEffect(() => {
    const loadData = async () => {
      try {
        const [quizzesData, subjectsData] = await Promise.all([
          fetchApi('/quizzes').catch(() => []), // If endpoint missing/errors, just default to empty
          fetchApi('/subjects')
        ]);
        setQuizzes(quizzesData);
        setSubjects(subjectsData || []);
      } catch (err) {
        console.error("Failed to load quizzes", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const handleGenerateQuiz = async () => {
    if (!selectedSubject) {
      setError("Please select a subject to test.");
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const response = await fetchApi('/quizzes/generate', {
        method: 'POST',
        body: JSON.stringify({
          source_type: 'subject',
          source_ids: [selectedSubject],
          count: numQuestions,
          difficulty: difficulty.toLowerCase()
        })
      });

      // Update local quiz list
      setQuizzes(prev => [response, ...prev]);
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

  return (
    <Box>
      <Group justify="space-between" mb="xl">
        <Box>
          <Title order={1} fw={800} style={{ fontFamily: 'Instrument Sans, sans-serif', color: '#171738' }}>My Quizzes</Title>
        </Box>
        <Button color="pink" leftSection={<IconPlus size={16} />} onClick={open}>
          Generate Quiz
        </Button>
      </Group>

      {/* Controls Bar */}
      <Paper withBorder p="md" radius="md" mb="xl" bg="gray.0">
        <Group>
          <TextInput 
            placeholder="Search quizzes..." 
            leftSection={<IconSearch size={16} />} 
            style={{ flex: 1 }}
          />
          <Select 
            placeholder="Sort by"
            data={['Newest First', 'Oldest First', 'Name (A-Z)']}
            defaultValue="Newest First"
          />
        </Group>
      </Paper>

      {/* Quizzes Grid */}
      {loading ? (
        <Center h={200}>
          <Stack align="center">
            <Loader color="pink" />
            <Text c="dimmed">Loading your quizzes...</Text>
          </Stack>
        </Center>
      ) : quizzes.length > 0 ? (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
          {quizzes.map((quiz) => (
            <Card key={quiz.id} withBorder radius="md" padding="xl" shadow="sm">
              <Group justify="space-between" mb="xs">
                <Text fw={700} size="lg" c="#171738">{quiz.title}</Text>
                <IconCards size={20} color="var(--mantine-color-pink-6)" />
              </Group>
              <Text size="sm" c="dimmed" mb="lg">
                {quiz.questions?.length || 0} Questions • Created {new Date(quiz.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>
              
              <Group grow>
                <Button variant="light" color="pink" onClick={() => startTakingQuiz(quiz)}>
                  Take Quiz
                </Button>
              </Group>
            </Card>
          ))}
        </SimpleGrid>
      ) : (
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
      )}

      {/* Generate Quiz Modal */}
      <Modal opened={opened} onClose={close} title="Generate AI Quiz" centered>
        {error && <Text color="red" size="sm" mb="sm">{error}</Text>}
        <Stack spacing="md">
          <Select
            label="Select Subject"
            placeholder="Choose subject to test"
            data={subjects.map(s => ({ value: s.id.toString(), label: s.name }))}
            value={selectedSubject}
            onChange={setSelectedSubject}
            required
          />
          <NumberInput
            label="Number of Questions"
            value={numQuestions}
            onChange={setNumQuestions}
            min={1}
            max={20}
          />
          <Select
            label="Difficulty"
            data={['Easy', 'Medium', 'Hard']}
            value={difficulty}
            onChange={setDifficulty}
          />
          <Button mt="md" fullWidth color="pink" onClick={handleGenerateQuiz} loading={generating} leftSection={<IconBolt size={16} />}>
            {generating ? 'Generating AI Quiz...' : 'Generate Quiz'}
          </Button>
        </Stack>
      </Modal>
    </Box>
  );
}
